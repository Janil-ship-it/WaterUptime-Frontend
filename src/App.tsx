import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { EmptyState } from "./components/ui";
import { StoreProvider } from "./data/store";
import { Jobs } from "./pages/Jobs";
import { Overview } from "./pages/Overview";
import { ReportFault } from "./pages/ReportFault";
import { Verification } from "./pages/Verification";
import { WaterPoints } from "./pages/WaterPoints";

function NotFound() {
  return (
    <EmptyState icon="explore_off" title="Page not found">
      <Link to="/" className="text-primary underline">
        Back to the overview
      </Link>
    </EmptyState>
  );
}

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="water-points" element={<WaterPoints />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id" element={<Jobs />} />
            <Route path="verification" element={<Verification />} />
            <Route path="report" element={<ReportFault />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
