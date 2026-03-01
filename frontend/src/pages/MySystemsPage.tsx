import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchSystems } from "../features/systems/api";
import { useLabStore } from "../store/labStore";

export function MySystemsPage(): JSX.Element {
  const navigate = useNavigate();
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);
  const systemsQuery = useQuery({ queryKey: ["systems"], queryFn: fetchSystems });

  if (systemsQuery.isLoading) return <div>Loading systems...</div>;
  if (systemsQuery.isError) return <div className="text-red-300">Unable to fetch systems.</div>;

  const systems = systemsQuery.data ?? [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-bold">My Systems</h2>
      {systems.length === 0 ? <div className="text-slate-400">No systems saved yet.</div> : null}
      <div className="grid gap-3">
        {systems.map((system) => (
          <div key={system.id} className="panel flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{system.title}</div>
              <div className="text-xs text-slate-400">ID {system.id}</div>
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                loadGraphJson(system.graph_json);
                setActiveSystemId(system.id);
                navigate("/app/lab", {
                  state: {
                    systemId: system.id,
                    systemTitle: system.title,
                    systemGraph: system.graph_json,
                  },
                });
              }}
            >
              Open in Lab
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
