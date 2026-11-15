import { useEffect, useState } from "react";
import { DeviceProvider } from "./device.tsx";
import { ProjectList } from "./pages/ProjectList.tsx";
import { ProjectPage } from "./pages/ProjectPage.tsx";

export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to: string) => {
    history.pushState(null, "", to);
    setPath(to);
  };
  const m = /^\/p\/([a-z0-9-]+)\/?$/.exec(path);
  return <DeviceProvider>{m ? <ProjectPage key={m[1]} id={m[1]!} navigate={navigate} /> : <ProjectList navigate={navigate} />}</DeviceProvider>;
}
