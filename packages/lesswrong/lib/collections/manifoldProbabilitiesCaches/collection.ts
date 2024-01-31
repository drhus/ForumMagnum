import schema from './schema';
import { createCollection } from "../../vulcan-lib";
import { addUniversalFields } from '../../collectionUtils';
import { ensureCustomPgIndex, ensureIndex } from '../../collectionIndexUtils';

export const ManifoldProbabilitiesCaches = createCollection({
  collectionName: 'ManifoldProbabilitiesCaches',
  typeName: 'ManifoldProbabilitiesCache',
  schema,
  logChanges: false,
  writeAheadLogged: false,
});

addUniversalFields({collection: ManifoldProbabilitiesCaches});

void ensureIndex(ManifoldProbabilitiesCaches, {
  marketId: 1
}, {unique: true})

export default ManifoldProbabilitiesCaches;
