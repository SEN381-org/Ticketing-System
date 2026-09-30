exports = async function (event) {
  const audit = context.services.get('mongodb-atlas').db('civicconnect').collection('auditLog');
  const upd = event.updateDescription?.updatedFields ?? {};
  const doc = event.fullDocument ?? {};                     // inserts only (history carries actorId)
  const actorId = upd.lastActorId ?? doc.actorId ?? null;
  try {
    await audit.insertOne({
      eventId: event._id._data,
      origin: 'trigger',
      eventType: `${event.ns.coll}.${event.operationType}`,
      campusId: doc.campusId ?? null,
      collectionName: event.ns.coll,
      documentId: event.documentKey._id,
      requestId: event.ns.coll === 'requests' ? event.documentKey._id : (doc.requestId ?? null),
      actorId,
      actorRole: upd.lastActorRole ?? doc.actorRole ?? null,
      actorSource: actorId ? 'document' : 'unattributed',
      changedFields: Object.keys(upd).concat(event.updateDescription?.removedFields ?? []),
      fromStatus: doc.fromStatus ?? null,
      toStatus: upd.status ?? doc.toStatus ?? null,
      occurredAt: event.clusterTime ? new Date(event.clusterTime.getHighBits() * 1000) : new Date(),
      recordedAt: new Date(),
    });
  } catch (e) {
    if (e.code !== 11000) throw e;                            // duplicate eventId = redelivery: already recorded
  }
};
