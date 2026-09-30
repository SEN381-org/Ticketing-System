// PROC-001 — anonymise requests closed >= 14 days ago. NFR-4.2, DEC-017. Run via mongosh.
// Usage: mongosh "$URI" --eval 'var DRY_RUN=true' --file scripts/retention/proc-001-anonymise.js
const DRY = (typeof DRY_RUN === 'undefined') ? true : DRY_RUN;   // safe default
const ELIGIBILITY_DAYS = 14;                                      // = 30 - longest run gap (16); see §2
const BATCH = 100;
const d = db.getSiblingDB('civicconnect');
const now = new Date();
const cutoff = new Date(now.getTime() - ELIGIBILITY_DAYS * 86400000);
const eligible = { 'closure.closedAt': { $ne: null, $lte: cutoff }, anonymisedAt: null,
                   status: { $in: ['Closed', 'Rejected'] } };

const counts = () => d.requests.aggregate([
  { $group: { _id: { c: '$categoryId', s: '$status' }, n: { $sum: 1 } } }, { $sort: { _id: 1 } },
]).toArray();

const before = counts();
const total = d.requests.countDocuments(eligible);
print(`PROC-001 run ${now.toISOString()} cutoff=${cutoff.toISOString()} eligible=${total} dryRun=${DRY}`);
if (DRY) { printjson(before); quit(0); }

const reqUnset = {
  description: null, location: null, requesterId: null, submittedById: null, assigneeId: null,
  'resolution.summary': null, 'resolution.recordedById': null,
  'closure.reason': null, 'closure.closedById': null,
};
let done = 0;
while (true) {
  const ids = d.requests.find(eligible, { _id: 1 }).limit(BATCH).toArray().map((r) => r._id);
  if (ids.length === 0) break;
  const session = db.getMongo().startSession();
  try {
    session.withTransaction(() => {
      const s = session.getDatabase('civicconnect');
      s.requests.updateMany({ _id: { $in: ids }, anonymisedAt: null }, {
        $set: { ...reqUnset, anonymisedAt: now, lastActorId: null, lastActorRole: 'PROC-001' },
        $inc: { version: 1 },
      });
      s.requestHistory.updateMany({ requestId: { $in: ids }, anonymisedAt: null },
        { $set: { body: null, actorId: null, fromAssigneeId: null, toAssigneeId: null, anonymisedAt: now } });
      s.notifications.deleteMany({ requestId: { $in: ids } });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { session.endSession(); }
  done += ids.length;
  print(`  anonymised ${done}/${total}`);
}

const remaining = d.requests.countDocuments(eligible);
const after = counts();
const same = JSON.stringify(before) === JSON.stringify(after);
print(`done=${done} remaining=${remaining} aggregatesUnchanged=${same}`);
if (remaining !== 0 || !same) { print('VERIFICATION FAILED — stop and escalate'); quit(1); }
