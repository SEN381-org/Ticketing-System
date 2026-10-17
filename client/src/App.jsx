import { AuthProvider, useAuth } from './auth.jsx';
import { shows } from './permissions.js';
import PrivacyNotice from './PrivacyNotice.jsx';
import RequestDetail from './RequestDetail.jsx';
import { Link, matchRoute, usePath } from './router.jsx';
import { SignInGate } from './SignIn.jsx';
import { AdminCategories, AdminUsers } from './screens/Admin.jsx';
import Management from './screens/Management.jsx';
import NewRequest from './screens/NewRequest.jsx';
import Notifications, { NotificationBell } from './screens/Notifications.jsx';
import MyRequests from './screens/RequestList.jsx';
import StaffList from './screens/StaffList.jsx';
import { Empty, PageHead } from './ui.jsx';

function Home() {
  const auth = useAuth();
  return (
    <div className="view">
      <PageHead title="CivicConnect" />
      <p className="muted">{auth.user?.displayName ? `Signed in as ${auth.user.displayName}.` : 'Signed in.'} Choose where to go.</p>
      <ul className="list">
        {links(auth.user).map(([to, label]) => (
          <li className="list__item" key={to}><Link className="list__link" to={to}>{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

const NotFound = () => <Empty title="No such page" mark="?" action={<Link className="btn" to="/">Go home</Link>}>Check the address, or start from the home page.</Empty>;

// The detail page signs in on its own, in place, so a request address opened
// signed out shows the prompt at that address (AC-FR-1.1). Every other page
// sits behind the shared prompt.
const gated = (element) => <SignInGate>{element}</SignInGate>;

const ROUTES = [
  { pattern: '/', render: () => gated(<Home />) },
  { pattern: '/requests', render: () => gated(<StaffList />) },
  { pattern: '/requests/mine', render: () => gated(<MyRequests />) },
  { pattern: '/requests/new', render: () => gated(<NewRequest />) },
  { pattern: '/requests/:id', render: ({ id }) => <RequestDetail id={id} /> },
  { pattern: '/notifications', render: () => gated(<Notifications />) },
  { pattern: '/management', render: () => gated(<Management />) },
  { pattern: '/admin/users', render: () => gated(<AdminUsers />) },
  { pattern: '/admin/categories', render: () => gated(<AdminCategories />) },
  { pattern: '/privacy', render: () => <PrivacyNotice /> },
];

/** The destinations offered to a user; shown by role, decided by the server. */
function links(user) {
  const out = [];
  if (shows(user, 'mine')) out.push(['/requests/mine', 'My requests']);
  if (shows(user, 'submit')) out.push(['/requests/new', 'New request']);
  if (shows(user, 'staffList')) out.push(['/requests', 'Requests']);
  if (shows(user, 'report')) out.push(['/management', 'Management view']);
  if (shows(user, 'administerUsers')) out.push(['/admin/users', 'Users']);
  if (shows(user, 'setTarget') || shows(user, 'administerCategories')) out.push(['/admin/categories', 'Categories']);
  return out;
}

function Shell({ children }) {
  const auth = useAuth();
  const path = usePath();
  return (
    <div className="shell">
      <header className="shell__bar">
        <div className="shell__inner">
          <Link className="brand" to="/">CivicConnect</Link>
          {auth.authed ? (
            <>
              <nav className="nav" aria-label="Main">
                {links(auth.user).map(([to, label]) => (
                  <Link key={to} className="nav__link" to={to} aria-current={path === to ? 'page' : undefined}>{label}</Link>
                ))}
              </nav>
              <div className="shell__user">
                {auth.user?.displayName ? <span className="shell__name">{auth.user.displayName}</span> : null}
                <NotificationBell />
                <button className="btn btn--quiet" type="button" onClick={() => auth.signOut().catch(() => {})}>Sign out</button>
              </div>
            </>
          ) : null}
        </div>
      </header>
      <main className="shell__main">{children}</main>
    </div>
  );
}

function Routes() {
  const auth = useAuth();
  const path = usePath();
  const found = matchRoute(ROUTES, path);
  return (
    <Shell>
      <div key={`${auth.epoch}:${path}`}>{found ? found.route.render(found.params) : <NotFound />}</div>
    </Shell>
  );
}

export default function App() {
  return <AuthProvider><Routes /></AuthProvider>;
}
