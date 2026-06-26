import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gerente Fina — Soberania Contábil-Gerencial" },
      {
        name: "description",
        content:
          "Gestão financeira pessoal com expurgo de fluxos neutros e regra do meio do mês.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
