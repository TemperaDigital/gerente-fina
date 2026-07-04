/**
 * Árvore de categorias padrão do sistema — base ordenada e deduplicada usada
 * por `seedDefaultCategories` (src/services/categories.functions.ts) para
 * popular a conta do usuário com um plano de contas completo.
 *
 * Decisão de dados (sem instrução explícita no pedido original): o pedido só
 * especifica `nature` por grupo — `kind` (income/expense) não foi informado.
 * Toda categoria aqui é `expense`, EXCETO "Receitas" (`income`), já que o
 * banco exige que categoria-pai e subcategorias compartilhem o mesmo `kind`
 * (trigger tg_categories_validate_parent). "Transferências" também ficou
 * como `expense` por não haver um "kind" neutro em categories — na prática
 * transações kind='transfer' nunca carregam category_id (CHECK do banco),
 * então essa categoria existe apenas para uso organizacional manual, se o
 * usuário quiser.
 */
export type CategoryNature = "FIXA" | "VARIÁVEL";
export type CategoryKind = "income" | "expense";

export interface DefaultCategoryGroup {
  name: string;
  kind: CategoryKind;
  nature: CategoryNature;
  /** Chave do ícone em CATEGORY_ICONS (icon-picker.tsx) — só o nível principal recebe ícone. */
  icon: string;
  children: string[];
}

export const DEFAULT_CATEGORY_TREE: DefaultCategoryGroup[] = [
  {
    name: "Alimentação",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "utensils",
    children: [
      "Açougue",
      "Cafés",
      "Delivery",
      "Lanches",
      "Mercearia",
      "Padaria",
      "Refeições",
      "Restaurantes",
      "Outras Alimentação",
    ],
  },
  {
    name: "Compras",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "shopping-bag",
    children: [
      "Acessórios",
      "Calçados",
      "Compras Físicas",
      "Compras Online",
      "Eletrônicos",
      "Equipamentos",
      "Informática",
      "Roupas",
      "Tecnologia",
    ],
  },
  {
    name: "Diversos",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "shapes",
    children: ["Ajustes", "Aniversário", "Compras Compartilhadas", "Doações", "Eventuais", "Presentes"],
  },
  {
    name: "Educação",
    kind: "expense",
    nature: "FIXA",
    icon: "graduation-cap",
    children: [
      "Colégio",
      "Doutorado",
      "Escola Idiomas",
      "Materiais",
      "Mestrado",
      "Moradia para Estudar",
      "Pós-Graduação",
      "Transporte Escolar",
      "Universidade",
      "Uniformes",
      "Outros com Educação",
    ],
  },
  {
    name: "Financeiro",
    kind: "expense",
    nature: "FIXA",
    icon: "landmark",
    children: [
      "Anuidade",
      "CDB",
      "Conversão Cambial",
      "Empréstimos",
      "Fatura de Cartão",
      "IOF",
      "Juros",
      "Renda Fixa",
      "Renda Variável",
      "Tarifas Bancárias",
    ],
  },
  {
    name: "Lazer",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "gamepad",
    children: [
      "Bike",
      "Cinema",
      "Eventos",
      "Hospedagens",
      "Lazer",
      "Passeios",
      "Quiosques",
      "Shows",
      "Teatro",
      "Turismo",
    ],
  },
  {
    name: "Manutenção",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "wrench",
    children: ["Eletrônicos", "Equipamentos", "Reparos", "Serviços Técnicos"],
  },
  {
    name: "Moradia",
    kind: "expense",
    nature: "FIXA",
    icon: "home",
    children: [
      "Água",
      "Assinaturas Digitais",
      "Celular",
      "Condomínio",
      "Cuidadora",
      "Empregada Doméstica",
      "Energia Elétrica",
      "Gás",
      "Internet",
      "IPTU",
      "Plano Celular",
      "Prestação Financiamento",
      "Serviços Fixos",
      "Telefone Fixo",
      "Taxa de Limpeza",
      "Outras Moradia",
    ],
  },
  {
    name: "Pet",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "paw-print",
    children: ["Alimentação", "Remédios", "Vacina", "Veterinário", "Outras Pet"],
  },
  {
    name: "Receitas",
    kind: "income",
    nature: "VARIÁVEL",
    icon: "wallet",
    children: ["Ajustes", "Reembolsos", "Rendimentos", "Repasses", "Salários"],
  },
  {
    name: "Saúde",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "heart-pulse",
    children: [
      "Academia de Ginástica",
      "Bem-Estar",
      "Cabeleireiros / Barbeiros",
      "Clínicas",
      "Clínicas de Estética",
      "Consultas",
      "Dentista",
      "Exames Laboratoriais",
      "Farmácia",
      "Hospitais",
      "Manicures e Pedicures",
      "Massagista",
      "Médicos",
      "Ótica",
      "Plano Médico",
      "Plano Odontológico",
      "Outras Saúde",
    ],
  },
  {
    name: "Supermercado",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "shopping-cart",
    children: ["Atacadista", "Feira/Varejão", "Hortifruti", "Sacolão", "Supermercado"],
  },
  {
    name: "Transferências",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "arrow-left-right",
    children: ["Externa", "Interna"],
  },
  {
    name: "Transporte",
    kind: "expense",
    nature: "VARIÁVEL",
    icon: "car",
    children: [
      "Combustível",
      "Estacionamento",
      "Lavagem Veículo",
      "Metrô",
      "Ônibus",
      "Pedágio",
      "Prestação Financiamento Veículo",
      "Seguro",
      "Táxi",
      "Trem",
      "Transporte por Aplicativo",
      "Uber",
      "Outras Transporte",
    ],
  },
];
