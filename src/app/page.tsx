import { ArtifactCalculator } from "@/components/artifact-calculator";
import packageJson from "../../package.json";

export default function Home() {
  return <ArtifactCalculator appName={packageJson.name} appVersion={packageJson.version} />;
}
