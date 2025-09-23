import { Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HelpProvider } from "@/components/Help/HelpProvider";
import HelpButton from "@/components/Help/HelpButton";
import { Link } from "react-router-dom";

function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img
            src="https://cdn.builder.io/api/v1/image/assets%2F57354a3351b04f99b21db2f9c36c0331%2F8c3f14108a774303b4c381565f348fb3?format=webp&width=800"
            alt="Techademy"
            className="h-7 w-auto"
          />
        </a>
        <nav className="hidden items-center gap-6 md:flex" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Global help button (small '?' circle) */}
          <div className="ml-2 flex items-center gap-2">
            <HelpButton />
            <Link to="/ui">
              <Button variant="ghost" className="hidden md:inline-flex">UI Guide</Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10">
      <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} AstraHire AI. All rights reserved.
        </p>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#" className="hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="hover:text-foreground">
            Terms
          </a>
          <a href="#" className="hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function MainLayout() {
  return (
    <HelpProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </HelpProvider>
  );
}
