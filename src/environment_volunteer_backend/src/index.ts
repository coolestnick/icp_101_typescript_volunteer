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
const Memebers = Record({
  name: text,
  location: text,
  specialist: text,
  regestrationNumber: Principal,
});

//register the group
const Group = Record({
  name: text,
  country: text,
  contactnumber: text,
  groupoficialemail: text,
  members: Vec(Memebers),
  services: text,
  created_at: nat64,
  id: Principal,
});

//defines types
type Group = typeof Group.tsType;
type Memeber = typeof Memebers.tsType;
//define payloads
const groupPayload = Record({
  name: text,
  country: text,
  contactnumber: text,
  groupoficialemail: text,
  services: text,
});
const memberPayload = Record({
  name: text,
  location: text,
  specialist: text,
  nameofgroup: text,
});

const searchPayload = Record({
  nameofgroup: text,
});

const memberLeavePayload = Record({
  name: text,
  regestrationNumber: Principal,
  groupname: text,
});
//defines errors
const errors = Variant({
  MissingCredentials: text,
  FailedToRegisterGroup: text,
  GroupAlreadyRegistered: text,
  GroupNotAvailble: text,
  ServicesNotAvailable: text,
  NotAMember: text,
});
const searchPayloadOnServices = Record({
  service: text,
});
const searchPayloadOnLocation = Record({
  location: text,
});
//storages
const groupstorages = StableBTreeMap<text, Group>(0);
const servicesStorages = StableBTreeMap<text, Group>(1);
const groupbasedonlocation = StableBTreeMap<text, Group>(2);
export default Canister({
  registerGroup: update([groupPayload], Result(text, errors), (payload) => {
    if (
      !payload.contactnumber ||
      !payload.country ||
      !payload.groupoficialemail ||
      !payload.name ||
      !payload.services
    ) {
      return Err({
        MissingCredentials: "some credentials are missing",
      });
    }

    //verify that the group is not already registered
    const getGroup = groupstorages.get(payload.name).Some;
    if (getGroup) {
      return Err({
        GroupAlreadyRegistered: "group already  exits",
      });
    }

    //register the group
    const new_group: Group = {
      name: payload.name,
      country: payload.country,
      contactnumber: payload.contactnumber,
      groupoficialemail: payload.groupoficialemail,
      members: [],
      services: payload.services,
      created_at: ic.time(),
      id: ic.caller(),
    };

    groupstorages.insert(payload.name, new_group);
    servicesStorages.insert(payload.services, new_group);
    groupbasedonlocation.insert(payload.country, new_group);
    return Ok("group registered successfully");
  }),

  //get all groups availabel for volunteer
  getallgroups: query([], Vec(Group), () => {
    return groupstorages.values();
  }),

  //search for a group by name

  get_a_group: query([searchPayload], Result(Group, errors), (payload) => {
    //verify payload is available
    if (!payload.nameofgroup) {
      return Err({
        MissingCredentials: "name of group is required",
      });
    }
    //get group
    const getgroup = groupstorages.get(payload.nameofgroup).Some;
    if (!getgroup) {
      return Err({
        GroupNotAvailble: `group with name ${payload.nameofgroup} is not available`,
      });
    }

    return Ok(getgroup);
  }),

  get_a_group_on_Services_offering: query(
    [searchPayloadOnServices],
    Result(Group, errors),
    (payload) => {
      //verify payload no empty
      if (!payload.service) {
        return Err({
          MissingCredentials: "some credentials are missing",
        });
      }

      const getgroup = servicesStorages.get(payload.service).Some;
      if (!getgroup) {
        return Err({
          GroupNotAvailble: `group offering ${payload.service} not available`,
        });
      }
      return Ok(getgroup);
    }
  ),

  //voluteer to the group

  volunteer: query([memberPayload], Result(text, errors), (payload) => {
    //verify that payload is not empty
    if (
      !payload.location ||
      !payload.name ||
      !payload.nameofgroup ||
      !payload.specialist
    ) {
      return Err({
        MissingCredentials: "some credentials are missing",
      });
    }

    //check if the group user is requesting to volunter is available

    const getGroup = groupstorages.get(payload.nameofgroup).Some;
    if (!getGroup) {
      return Err({
        GroupNotAvailble: `group with name ${payload.nameofgroup} is naot available`,
      });
    }

    //check if services user is offereing are availabe

    const getservice = servicesStorages.get(payload.specialist).Some;
    if (!getservice) {
      return Err({
        ServicesNotAvailable: `services you are voluntering are not currently offered by ${payload.nameofgroup}`,
      });
    }

    //new member
    const new_member: Memeber = {
      name: payload.name,
      location: payload.location,
      specialist: payload.specialist,
      regestrationNumber: ic.caller(),
    };

    //update group members

    const updated_group: Group = {
      ...getGroup,
      members: [...getGroup.members, new_member],
    };

    //update services
    const updatedServices: Group = {
      ...getGroup,
      members: [...getGroup.members, new_member],
    };
    servicesStorages.insert(payload.specialist, updatedServices);
    groupstorages.insert(payload.nameofgroup, updated_group);
    groupbasedonlocation.insert(getGroup.country, updatedServices);
    return Ok("succeesfully volunteerd");
  }),

  //user leave volunteer group
  member_leave_group: update(
    [memberLeavePayload],
    Result(text, errors),
    (payload) => {
      //verify that payload is not empty
      if (!payload.groupname || !payload.name || !payload.regestrationNumber) {
        return Err({
          MissingCredentials: "some credentials are missing",
        });
      }

      //check if the group exists
      const getGroup = groupstorages.get(payload.groupname).Some;
      if (!getGroup) {
        return Err({
          GroupNotAvailble: `group with name ${payload.groupname} is naot available`,
        });
      }

      //check if member exists
      const member_exist = getGroup.members.filter(
        (val) => val.name == payload.name
      );

      if (!member_exist) {
        return Err({
          NotAMember: `You are not a member of ${payload.groupname}`,
        });
      }

      //leave group
      const updatedgroup: Group = {
        ...getGroup,
        members: getGroup.members.filter((val) => payload.name !== val.name),
      };

      groupstorages.insert(getGroup.name, updatedgroup);
      servicesStorages.insert(getGroup.services, updatedgroup);
      groupbasedonlocation.insert(getGroup.country, updatedgroup);

      return Ok("exited group successfully");
    }
  ),
});
