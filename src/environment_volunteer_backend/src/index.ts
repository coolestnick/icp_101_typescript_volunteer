import {
  Canister,
  Err,
  ic,
  nat64,
  Ok,
  Principal,
  query,
  Record,
  Result,
  StableBTreeMap,
  text,
  update,
  Variant,
  Vec,
} from "azle";

//members
const Members = Record({
  name: text,
  location: text,
  specialist: text,
  registrationNumber: Principal,
});

//register the group
const Group = Record({
  id: nat64,
  name: text,
  country: text,
  contactNumber: text,
  groupOfficialEmail: text,
  members: Vec(Members),
  services: text,
  created_at: nat64,
});

//defines types
type Group = typeof Group.tsType;
type Member = typeof Members.tsType;

//define payloads
const groupPayload = Record({
  name: text,
  country: text,
  contactNumber: text,
  groupOfficialEmail: text,
  services: text,
});

const memberPayload = Record({
  name: text,
  location: text,
  specialist: text,
  nameOfGroup: text,
});

const searchPayload = Record({
  nameOfGroup: text,
});

const memberLeavePayload = Record({
  name: text,
  registrationNumber: Principal,
  groupName: text,
});

const searchPayloadOnServices = Record({
  service: text,
});

const searchPayloadOnLocation = Record({
  location: text,
});

// Error variants for better error handling
const errors = Variant({
  MissingCredentials: text,
  FailedToRegisterGroup: text,
  GroupAlreadyRegistered: text,
  GroupNotAvailable: text,
  ServicesNotAvailable: text,
  NotAMember: text,
});

// storages
const groupStorage = StableBTreeMap<text, Group>(0);
const servicesStorage = StableBTreeMap<text, Group>(1);
const locationBasedGroupStorage = StableBTreeMap<text, Group>(2);

// Unique ID counter for groups
let groupIDCounter: nat64 = 1;

// Helper function to generate a unique ID
function generateGroupID(): nat64 {
  return groupIDCounter++;
}

// Helper function to check for missing fields
function validateGroupPayload(payload: typeof groupPayload.tsType): Result<null, typeof errors> {
  if (!payload.name || !payload.country || !payload.contactNumber || !payload.groupOfficialEmail || !payload.services) {
    return Err({
      MissingCredentials: "Some credentials are missing",
    });
  }
  return Ok(null);
}

// Helper function to validate member payload
function validateMemberPayload(payload: typeof memberPayload.tsType): Result<null, typeof errors> {
  if (!payload.name || !payload.location || !payload.specialist || !payload.nameOfGroup) {
    return Err({
      MissingCredentials: "Some member credentials are missing",
    });
  }
  return Ok(null);
}

export default Canister({
  // Register a group
  registerGroup: update([groupPayload], Result(text, errors), (payload) => {
    const validation = validateGroupPayload(payload);
    if (validation.Err) return validation;

    // Verify that the group is not already registered
    const existingGroup = groupStorage.get(payload.name).Some;
    if (existingGroup) {
      return Err({
        GroupAlreadyRegistered: "Group already exists",
      });
    }

    // Register the group with a unique ID
    const newGroup: Group = {
      id: generateGroupID(),
      name: payload.name,
      country: payload.country,
      contactNumber: payload.contactNumber,
      groupOfficialEmail: payload.groupOfficialEmail,
      members: [],
      services: payload.services,
      created_at: ic.time(),
    };

    groupStorage.insert(payload.name, newGroup);
    servicesStorage.insert(payload.services, newGroup);
    locationBasedGroupStorage.insert(payload.country, newGroup);

    return Ok("Group registered successfully");
  }),

  // Get all groups available
  getAllGroups: query([], Vec(Group), () => {
    return groupStorage.values();
  }),

  // Search for a group by name
  getGroupByName: query([searchPayload], Result(Group, errors), (payload) => {
    if (!payload.nameOfGroup) {
      return Err({
        MissingCredentials: "Name of group is required",
      });
    }

    const group = groupStorage.get(payload.nameOfGroup).Some;
    if (!group) {
      return Err({
        GroupNotAvailable: `Group with name ${payload.nameOfGroup} is not available`,
      });
    }

    return Ok(group);
  }),

  // Search for groups by services offered
  getGroupByService: query([searchPayloadOnServices], Result(Group, errors), (payload) => {
    if (!payload.service) {
      return Err({
        MissingCredentials: "Service field is required",
      });
    }

    const group = servicesStorage.get(payload.service).Some;
    if (!group) {
      return Err({
        GroupNotAvailable: `Group offering ${payload.service} is not available`,
      });
    }

    return Ok(group);
  }),

  // Volunteer to join a group
  volunteer: update([memberPayload], Result(text, errors), (payload) => {
    const validation = validateMemberPayload(payload);
    if (validation.Err) return validation;

    // Check if the group exists
    const group = groupStorage.get(payload.nameOfGroup).Some;
    if (!group) {
      return Err({
        GroupNotAvailable: `Group with name ${payload.nameOfGroup} is not available`,
      });
    }

    // Check if the services user is offering are available
    const serviceGroup = servicesStorage.get(payload.specialist).Some;
    if (!serviceGroup) {
      return Err({
        ServicesNotAvailable: `Service '${payload.specialist}' is not offered by ${payload.nameOfGroup}`,
      });
    }

    // Add new member
    const newMember: Member = {
      name: payload.name,
      location: payload.location,
      specialist: payload.specialist,
      registrationNumber: ic.caller(),
    };

    // Update the group with the new member
    const updatedGroup: Group = {
      ...group,
      members: [...group.members, newMember],
    };

    groupStorage.insert(payload.nameOfGroup, updatedGroup);
    servicesStorage.insert(payload.specialist, updatedGroup);
    locationBasedGroupStorage.insert(group.country, updatedGroup);

    return Ok("Successfully volunteered");
  }),

  // Member leaves the group
  memberLeaveGroup: update([memberLeavePayload], Result(text, errors), (payload) => {
    if (!payload.groupName || !payload.name || !payload.registrationNumber) {
      return Err({
        MissingCredentials: "Some credentials are missing",
      });
    }

    const group = groupStorage.get(payload.groupName).Some;
    if (!group) {
      return Err({
        GroupNotAvailable: `Group with name ${payload.groupName} is not available`,
      });
    }

    // Check if member exists in the group
    const memberExists = group.members.find((m) => m.name === payload.name && m.registrationNumber === payload.registrationNumber);
    if (!memberExists) {
      return Err({
        NotAMember: `You are not a member of ${payload.groupName}`,
      });
    }

    // Remove member from the group
    const updatedGroup: Group = {
      ...group,
      members: group.members.filter((m) => m.name !== payload.name),
    };

    groupStorage.insert(group.name, updatedGroup);
    servicesStorage.insert(group.services, updatedGroup);
    locationBasedGroupStorage.insert(group.country, updatedGroup);

    return Ok("Successfully exited the group");
  }),

  // List all available services across groups
  listAllServices: query([], Vec(text), () => {
    return servicesStorage.keys();
  }),
});
