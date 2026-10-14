/**
 * The declared indexes, read from the models. Traces to: TD-004, DEC-003 v0.3 (deployment step 5).
 *
 * The index specifications live in src/models/*.js and nowhere else; nothing here retypes one.
 * The count is whatever the models declare.
 *
 * Mongoose creates collections and indexes by itself when a model meets a connection. That is
 * the opposite of what a provisioning script may do before its privilege check, so the two
 * switches are turned off here, at the top of this module, before any model is imported. The
 * models are imported dynamically, inside loadDeclared(), for that reason. Importing this
 * module opens no connection.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const MODELS_DIR = path.resolve(import.meta.dirname, '..', '..', 'src', 'models');

/** @returns [{ file, model, collection, indexes }] sorted by file name. indexes is schema.indexes(). */
export async function loadDeclared(dir = MODELS_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js') && f !== '_shared.js').sort();
  const declared = [];
  for (const file of files) {
    const { default: model } = await import(pathToFileURL(path.join(dir, file)).href);
    if (!model?.schema || !model.collection) throw new Error(`${file} does not default-export a Mongoose model`);
    declared.push({ file, model, collection: model.collection.collectionName, indexes: model.schema.indexes() });
  }
  return declared;
}
