import AbstractRepo from "./AbstractRepo";
import Localgroups from "../../lib/collections/localgroups/collection";
import { recordPerfMetrics } from "./perfMetricDecorator";

class LocalgroupsRepo extends AbstractRepo<DbLocalgroup> {
  constructor() {
    super(Localgroups);
  }

  moveUserLocalgroupsToNewUser(oldUserId: string, newUserId: string): Promise<null> {
    return this.none(`
      -- LocalgroupsRepo.moveUserLocalgroupsToNewUser
      UPDATE "Localgroups"
      SET "organizerIds" = ARRAY_APPEND(ARRAY_REMOVE("organizerIds", $1), $2)
      WHERE ARRAY_POSITION("organizerIds", $1) IS NOT NULL
    `, [oldUserId, newUserId]);
  }
}

recordPerfMetrics(LocalgroupsRepo);

export default LocalgroupsRepo;
