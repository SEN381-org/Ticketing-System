import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
import { destinations, homePath, isRequesterOnly } from './permissions.js';
import PrivacyNotice from './PrivacyNotice.jsx';
import RequestDetail from './RequestDetail.jsx';
import { Link, matchRoute, navigate, usePath } from './router.jsx';
import { SignInGate } from './SignIn.jsx';
import { AdminCategories, AdminUsers } from './screens/Admin.jsx';
import Management from './screens/Management.jsx';
import NewRequest from './screens/NewRequest.jsx';
import Notifications, { NotificationBell } from './screens/Notifications.jsx';
import MyRequests from './screens/RequestList.jsx';
import StaffList from './screens/StaffList.jsx';
import { Empty, Logo, NoAccess } from './ui.jsx';

/** Sends a signed-in user to where their role starts; a user with nowhere to go is told so. */
function Home() {
  const auth = useAuth();
  const to = homePath(auth.user);
  useEffect(() => { if (to !== '/') navigate(to, { replace: true }); }, [to]);
  return to === '/' ? <NoAccess what="any page" /> : null;
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

function SignOutButton() {
  const auth = useAuth();
  return <button className="btn btn--ghost" type="button" onClick={() => auth.signOut().catch(() => {})}>Sign out</button>;
}

/** Teal bar for a requester: brand, notifications, sign out. */
function Bar() {
  const auth = useAuth();
  return (
    <header className="bar">
      <div className="bar__inner">
        <Link className="brand" to="/"><Logo size={32} inverse />CivicConnect</Link>
        <div className="bar__user">
          {auth.user?.displayName ? <span className="bar__name">{auth.user.displayName}</span> : null}
          <NotificationBell />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

/** Dark side panel for staff and administrators; it stacks above the page on a phone. */
function Side() {
  const auth = useAuth();
  const path = usePath();
  return (
    <header className="side">
      <Link className="brand" to="/"><Logo size={36} />CivicConnect</Link>
      <nav className="side__nav" aria-label="Main">
        {destinations(auth.user).map(([to, label]) => (
          <Link key={to} className="side__link" to={to} aria-current={path === to ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      <div className="side__user">
        <span className="side__name">{auth.user?.displayName ?? 'Signed in'}</span>
        <div className="side__actions">
          <NotificationBell />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

function Shell({ children }) {
  const auth = useAuth();
  const side = auth.authed && !isRequesterOnly(auth.user);
  return (
    <div className={side ? 'shell shell--side' : 'shell'}>
      {auth.authed ? (side ? <Side /> : <Bar />) : null}
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
