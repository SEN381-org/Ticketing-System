import RequestDetail from './RequestDetail.jsx';

// No router library: the path is read once. Only /requests/:id is a page.
export default function App() {
  const match = /^\/requests\/([^/]+)\/?$/.exec(location.pathname);
  if (!match) return <p>No such page</p>;
  return <RequestDetail id={decodeURIComponent(match[1])} />;
}
