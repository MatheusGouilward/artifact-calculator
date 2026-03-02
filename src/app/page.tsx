import { HomeEntry } from "@/components/home-entry";
import packageJson from "../../package.json";

export default function Home() {
  return <HomeEntry appName={packageJson.name} appVersion={packageJson.version} />;
}
