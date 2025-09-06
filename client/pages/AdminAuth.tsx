import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function AdminAuth() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  const regForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });
  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onRegister = async (values: z.infer<typeof registerSchema>) => {
    setMessage(null);
    const res = await fetch("/api/admin/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Registration failed");
      return;
    }
    setMessage(
      "Registration successful. Please check your email to verify and continue.",
    );
  };

  const onLogin = async (values: z.infer<typeof loginSchema>) => {
    setMessage(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Login failed");
      return;
    }
    navigate("/admin", { replace: true });
  };

  return (
    <section className="bg-gradient-to-b from-background to-muted/40">
      <div className="container grid gap-6 py-10 md:grid-cols-2 md:py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Admin Access
          </h1>
          <p className="mt-2 text-muted-foreground">
            Have an account? Sign in. Otherwise, create your admin account.
          </p>
          {message && (
            <div className="mt-4 rounded-md border bg-card p-3 text-sm">
              {message}
            </div>
          )}
        </div>

        <div className="grid gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in or sign up</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                  <form
                    className="space-y-3"
                    onSubmit={loginForm.handleSubmit(onLogin)}
                  >
                    <div className="grid gap-2">
                      <label className="text-sm">Email</label>
                      <input
                        className="h-10 rounded-md border bg-background px-3"
                        {...loginForm.register("email")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm">Password</label>
                      <input
                        type="password"
                        className="h-10 rounded-md border bg-background px-3"
                        {...loginForm.register("password")}
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Sign in
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form
                    className="space-y-3"
                    onSubmit={regForm.handleSubmit(onRegister)}
                  >
                    <div className="grid gap-2">
                      <label className="text-sm">Full Name</label>
                      <input
                        className="h-10 rounded-md border bg-background px-3"
                        {...regForm.register("name")}
                      />
                      {regForm.formState.errors.name && (
                        <p className="text-xs text-destructive">
                          {regForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm">Work Email</label>
                      <input
                        className="h-10 rounded-md border bg-background px-3"
                        {...regForm.register("email")}
                      />
                      {regForm.formState.errors.email && (
                        <p className="text-xs text-destructive">
                          {regForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm">Company</label>
                      <input
                        className="h-10 rounded-md border bg-background px-3"
                        {...regForm.register("company")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm">Password</label>
                      <input
                        type="password"
                        className="h-10 rounded-md border bg-background px-3"
                        {...regForm.register("password")}
                      />
                      {regForm.formState.errors.password && (
                        <p className="text-xs text-destructive">
                          {regForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <Button type="submit" className="w-full">
                      Create Account
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
