import { permanentRedirect } from "next/navigation";

export default function OfferPageLegacyRedirect() {
  permanentRedirect("/terms");
}
