import { Link } from "wouter";
import { Lock, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">404</h1>
        <p className="text-muted-foreground mt-2">This page is encrypted — or does not exist.</p>
      </div>
      <Link href="/">
        <a className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors">
          <Home className="w-4 h-4" />
          Back to Home
        </a>
      </Link>
    </div>
  );
}
