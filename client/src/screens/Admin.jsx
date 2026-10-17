// Administration screens. Traces to: FR-1.4 (create, amend roles, revoke),
// FR-1.2 and AC-FR-1.2 (a role is required: the server refuses, the client shows
// it), FR-8.4 (a Manager sets a category target time), FR-9.1 (an Administrator
// deactivates a category). Presentation only: the server decides.

import { useState } from 'react';
import { ROLE } from '../../../shared/domainValues.js';
import {
  createUser, deactivateCategory, itemsOf, listCategories, listUsers, revokeUser, setCategoryTarget, setUserRoles,
} from '../api.js';
import { useAuth } from '../auth.jsx';
import { homePath, shows } from '../permissions.js';
import { BackLink, Empty, Field, Loading, NoAccess, PageHead, Problem, asError, useActionKey, useLoad } from '../ui.jsx';
import { fieldErrorsOf } from './NewRequest.jsx';

const ROLES = Object.values(ROLE);

function RoleChecks({ idPrefix, value, onChange }) {
  const toggle = (r) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <fieldset className="field">
      <legend className="field__label">Roles</legend>
      {ROLES.map((r) => (
        <div className="check" key={r}>
          <input id={`${idPrefix}-${r}`} type="checkbox" checked={value.includes(r)} onChange={() => toggle(r)} />
          <label htmlFor={`${idPrefix}-${r}`}>{r}</label>
        </div>
      ))}
    </fieldset>
  );
}

function NewUser({ onCreated }) {
  const [form, setForm] = useState({ email: '', displayName: '', password: '', roles: [] });
  const [error, setError] = useState(null);
  const key = useActionKey();
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const fields = error?.status === 400 ? fieldErrorsOf(error.problem, ['email', 'displayName', 'password', 'roles']) : {};
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      await createUser(form, key.current()); key.renew();
      setForm({ email: '', displayName: '', password: '', roles: [] });
      await onCreated();
    } catch (err) { setError(asError(err)); }
  };
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Create a user</h2>
      <Field id="u-email" label="User email" error={fields.email}><input className="input" id="u-email" value={form.email} onChange={set('email')} /></Field>
      <Field id="u-name" label="Display name" error={fields.displayName}><input className="input" id="u-name" value={form.displayName} onChange={set('displayName')} /></Field>
      <Field id="u-pass" label="Initial password" error={fields.password}>
        <input className="input" id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
      </Field>
      <RoleChecks idPrefix="new" value={form.roles} onChange={(roles) => setForm((f) => ({ ...f, roles }))} />
      <Problem error={error} />
      <button className="btn" type="submit">Create user</button>
    </form>
  );
}

function UserRow({ user, onChanged }) {
  const [roles, setRoles] = useState(user.roles ?? []);
  const [error, setError] = useState(null);
  const rolesKey = useActionKey();
  const revokeKey = useActionKey();
  const run = async (fn) => { setError(null); try { await fn(); await onChanged(); } catch (e) { setError(asError(e)); } };
  return (
    <li className="panel">
      <h3>{user.displayName}</h3>
      {user.email ? <p className="muted small">{user.email}</p> : null}
      <RoleChecks idPrefix={`r-${user.id}`} value={roles} onChange={setRoles} />
      <div className="row">
        <button className="btn btn--quiet" type="button" onClick={() => run(async () => { await setUserRoles(user.id, roles, rolesKey.current()); rolesKey.renew(); })}>
          Save roles
        </button>
        <button className="btn btn--danger" type="button" onClick={() => run(async () => { await revokeUser(user.id, revokeKey.current()); revokeKey.renew(); })}>
          Revoke access
        </button>
      </div>
      <Problem error={error} />
    </li>
  );
}

export function AdminUsers() {
  const auth = useAuth();
  const users = useLoad(() => listUsers(), []);
  const list = itemsOf(users.data?.data);
  if (users.error?.status === 403) return <NoAccess what="user administration" />;
  return (
    <div className="view">
      <BackLink to={homePath(auth.user)} />
      <PageHead title="Users" />
      <NewUser onCreated={users.reload} />
      <Problem error={users.error} />
      {users.loading ? <Loading lines={4} label="Loading users" /> : !list.length ? (
        <Empty title="No users" mark="·">Created users are listed here.</Empty>
      ) : <ul className="plain-list">{list.map((u) => <UserRow key={u.id} user={u} onChanged={users.reload} />)}</ul>}
    </div>
  );
}

function CategoryRow({ category, canTarget, canDeactivate, onChanged }) {
  const [hours, setHours] = useState(category.targetResolutionHours ?? '');
  const [error, setError] = useState(null);
  const targetKey = useActionKey();
  const deactKey = useActionKey();
  const run = async (fn) => { setError(null); try { await fn(); await onChanged(); } catch (e) { setError(asError(e)); } };
  return (
    <li className="panel">
      <h3 className="cap">{category.name}</h3>
      {category.isSecurity ? <p className="small muted">Security category</p> : null}
      {canTarget ? (
        <div className="row">
          <Field id={`t-${category.id}`} label={`Target time in hours for ${category.name}`}>
            <input className="input" id={`t-${category.id}`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <button className="btn btn--quiet" type="button"
            onClick={() => run(async () => { await setCategoryTarget(category.id, Number(hours), targetKey.current()); targetKey.renew(); })}>
            Save target
          </button>
        </div>
      ) : null}
      {canDeactivate ? (
        <button className="btn btn--danger" type="button"
          onClick={() => run(async () => { await deactivateCategory(category.id, deactKey.current()); deactKey.renew(); })}>
          Deactivate {category.name}
        </button>
      ) : null}
      <Problem error={error} />
    </li>
  );
}

export function AdminCategories() {
  const auth = useAuth();
  const cats = useLoad(listCategories, []);
  const list = itemsOf(cats.data?.data);
  if (cats.error?.status === 403) return <NoAccess what="category administration" />;
  return (
    <div className="view">
      <BackLink to={homePath(auth.user)} />
      <PageHead title="Categories" />
      <Problem error={cats.error} />
      {cats.loading ? <Loading lines={4} label="Loading categories" /> : !list.length ? (
        <Empty title="No active categories" mark="☐">Deactivated categories are not listed.</Empty>
      ) : (
        <ul className="plain-list">
          {list.map((c) => (
            <CategoryRow key={c.id} category={c} onChanged={cats.reload}
              canTarget={shows(auth.user, 'setTarget')} canDeactivate={shows(auth.user, 'administerCategories')} />
          ))}
        </ul>
      )}
    </div>
  );
}
