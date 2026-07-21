import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  // A conciliação foi incorporada ao Extrato Bancário (aba "Conciliação").
  // A rota permanece apenas para não quebrar links salvos.
  component: () => <Navigate to="/extrato" replace />,
});
