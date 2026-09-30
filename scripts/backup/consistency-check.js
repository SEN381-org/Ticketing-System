// DEC-010 restore consistency check (mongosh). Exits 1 on mismatch.
const d = db.getSiblingDB('civicconnect_restore');
const bad = d.requests.aggregate([
  { $lookup: { from: 'requestHistory', localField: '_id', foreignField: 'requestId', as: 'h',
               pipeline: [{ $group: { _id: null, maxV: { $max: '$requestVersion' } } }] } },
  // PROC-001 bumps version once without a history entry (not a lifecycle event), so expect +1 when anonymised.
  { $project: { version: 1, anonymisedAt: 1,
                expected: { $add: [{ $ifNull: [{ $first: '$h.maxV' }, 0] },
                                   { $cond: [{ $ifNull: ['$anonymisedAt', false] }, 1, 0] }] } } },
  { $match: { $expr: { $ne: ['$version', '$expected'] } } },
]).toArray();
print(`requests=${d.requests.countDocuments()} history=${d.requestHistory.countDocuments()} mismatched=${bad.length}`);
if (bad.length) { printjson(bad.slice(0, 20)); quit(1); }
