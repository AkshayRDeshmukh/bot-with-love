import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import MainLayout from "@/components/layout/MainLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";
import CandidatePortal from "./pages/CandidatePortal";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminAuth from "./pages/AdminAuth";
import AdminInterviewEditor from "./pages/AdminInterviewEditor";
import CandidateBotPreview from "./pages/CandidateBotPreview";
import AdminInterviewCandidates from "./pages/AdminInterviewCandidates";
import AdminInterviewReports from "./pages/AdminInterviewReports";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route index element={<Index />} />
              <Route
                path="admin"
                element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/interviews/new"
                element={
                  <ProtectedRoute>
                    <AdminInterviewEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/interviews/:id/edit"
                element={
                  <ProtectedRoute>
                    <AdminInterviewEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/interviews/:id/candidates"
                element={
                  <ProtectedRoute>
                    <AdminInterviewCandidates />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/interviews/:id/reports"
                element={
                  <ProtectedRoute>
                    <AdminInterviewReports />
                  </ProtectedRoute>
                }
              />
              <Route path="admin/auth" element={<AdminAuth />} />
              <Route path="candidate" element={<CandidatePortal />} />
              <Route
                path="candidate/preview"
                element={<CandidateBotPreview />}
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

const container = document.getElementById("root")!;
const existingRoot = (window as any).__app_root;
const root = existingRoot || createRoot(container);
(window as any).__app_root = root;
root.render(<App />);
