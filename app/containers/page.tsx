import { isDemo } from "@/lib/containers/track";
import Tracker from "./Tracker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Container Tracker" };

export default function ContainersPage() {
  return <Tracker demo={isDemo()} />;
}
