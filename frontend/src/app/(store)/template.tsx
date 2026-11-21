export default function Template({ children }: { children: React.ReactNode }) {
  // A template re-mounts on navigation, which plays the shared page entrance.
  return <div className="m-page">{children}</div>;
}
