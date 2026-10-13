import { placeholderRoute } from "@/components/layout/placeholder-route";

const route = placeholderRoute("about", "/about");

export const generateMetadata = route.generateMetadata;
export default route.Page;
