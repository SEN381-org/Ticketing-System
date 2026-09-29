/**
 * Persistence access for requests. Traces to: FR-6.2, DEC-002.
 */
import Request from '../models/Request.js';

export const requestRepository = {
  findById: (id) => Request.findById(id).lean(),
  updateStatus: (id, status, at) =>
    Request.updateOne({ _id: id }, { $set: { status, statusChangedAt: at } }),
};
