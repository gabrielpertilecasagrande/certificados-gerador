import { ProjectsHome } from "@/features/projects/projects-home";
import { Providers } from "./providers";

export default function HomePage() {
  return (
    <Providers>
      <ProjectsHome />
    </Providers>
  );
}
