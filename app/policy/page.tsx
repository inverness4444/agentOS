import { permanentRedirect } from "next/navigation";

export default function PolicyPageLegacyRedirect() {
  permanentRedirect("/privacy");
}
