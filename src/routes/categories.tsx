import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Folder, FolderPlus, ChevronDown, ChevronRight, Edit2, Trash2, Tag, Layers } from 'lucide-react';

export const Route = createFileRoute('/categories')({
  component: CategoriesComponent,
});

// Mock estruturado de categorias com suporte nativo a Pai/Filho conforme o PRD
const INITIAL_CATEGORIES = [
  { id: '1', name: 'Alimentação', type: 'expense', parent_id: null, isExpanded: true },
  { id: '1-1', name: 'Supermercado', type: 'expense', parent_id: '1', isExpanded: false },
  { id: '1-2', name: 'Restaurantes / Delivery', type: 'expense', parent_id: '1', isExpanded: false },
  
  { id: '2', name: 'Habitação', type: 'expense', parent_id: null, isExpanded: true },
  { id: '2-1', name: 'Aluguel / Condomínio', type: 'expense', parent_id: '2', isExpanded: false },
  { id: '2-2', name: 'Energia / Água', type: 'expense', parent_id: '2', isExpanded: false },

  { id: '3', name: 'Transporte', type: 'expense', parent_id: null, isExpanded: false },
  { id: '3-1', name: 'Combustível', type: 'expense', parent_id: '3', isExpanded: false },
  { id: '3-2', name: 'Uber / Transporte Público', type: 'expense', parent_id: '3', isExpanded: false },

  { id: '4', name: 'Rendimentos Profissionais', type: 'income', parent_id: null, isExpanded: true },
  { id: '4-1', name: 'Salário Principal', type: 'income', parent_id: '4', isExpanded: false },
  { id: '4-2', name: 'Projetos Freelance', type: 'income', parent_id: '4', isExpanded: false },

  { id: '5', name: 'Investimentos', type: 'income', parent_id: null, isExpanded: false },
  { id: '5-1', name: 'Dividendos / JCP', type: 'income', parent_id: '5', isExpanded: false },
];

function CategoriesComponent() {
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  
  // States do Formulário
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [catParentId, setCatParentId] = useState<string>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, isExpanded: !c.isExpanded } : c));
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setCatName('');
    setCatType(activeTab);
    setCatParentId('none');
    setShowModal(true);
  };

  const handleOpenEdit = (category: typeof INITIAL_CATEGORIES[0]) => {
    setModalMode('edit');
    setSelectedId(category.id);
    setCatName(category.name);
    setCatType(category.type as 'expense' | 'income');
    setCatParentId(category.parent_id || 'none');
    setShowModal(true);
  };

  const handleSave = () => {
    if (!catName.trim()) return;

    if (modalMode === 'create') {
      const newCat = {
        id: Date.now().toString(),
        name: catName,
        type: catType,
        parent_id: catParentId === 'none' ? null : catParentId,
        isExpanded: false
      };
      setCategories(prev => [...prev, newCat]);
    } else if (modalMode === 'edit' && selectedId) {
      setCategories(prev => prev.map(c => c.id === selectedId ? { 
        ...c, 
        name: catName, 
        type: catType, 
        parent_id: catParentId === 'none' ? null : catParentId 
      } : c));
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    // Remove a categoria e também os filhos em cascata para segurança estrutural
    setCategories(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
  };

  // Filtra as categorias raiz (sem pai) conforme a aba ativa
  const rootCategories = categories.filter(c => c.type === activeTab && c.parent_id === null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      
      {/* Topo Dinâmico */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Gerenciamento de Categorias
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Customize sua árvore mercadológica para refinar os relatórios dinâmicos do DRE.
          </p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" /> Nova Categoria[cite: 2]
        </button>
      </div>

      {/* Alternador de Fluxo (Tabs) */}
      <div className="flex border-b border-zinc-900 max-w-xs bg-white/[0.02] p-1 rounded-xl border border-white/[0.04]">
        <button 
          onClick={() => setActiveTab('expense')}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === 'expense' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          🛑 Despesas[cite: 2]
        </button>
        <button 
          onClick={() => setActiveTab('income')}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === 'income' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          🟢 Receitas[cite: 2]
        </button>
      </div>

      {/* Árvore de Listagem */}
      <div className="max-w-3xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-3">
        {rootCategories.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 space-y-1">
            <Tag className="w-10 h-10 mx-auto opacity-20" />
            <p className="text-sm">Nenhuma categoria cadastrada para este fluxo.</p>
          </div>
        ) : (
          rootCategories.map((parent) => {
            const children = categories.filter(c => c.parent_id === parent.id);
            return (
              <div key={parent.id} className="border border-zinc-900 rounded-xl bg-zinc-900/20 overflow-hidden">
                {/* Linha da Categoria Pai */}
                <div className="flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors">
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => toggleExpand(parent.id)}
                      disabled={children.length === 0}
                      className={`text-zinc-500 hover:text-white transition-colors ${children.length === 0 ? 'opacity-20 cursor-not-allowed' : ''}`}
                    >
                      {parent.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <Folder className="w-5 h-5 text-indigo-400" />
                    <span className="font-semibold text-zinc-200 text-sm">{parent.name}[cite: 2]</span>
                    {children.length > 0 && (
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full font-mono">
                        {children.length} sub
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <button onClick={() => handleOpenEdit(parent)} className="text-zinc-500 hover:text-white p-1.5 rounded transition-colors" title="Editar Pai"><Edit2 className="w-4 h-4"[cite: 2]</button>
                    <button onClick={() => handleDelete(parent.id)} className="text-zinc-600 hover:text-rose-400 p-1.5 rounded transition-colors" title="Excluir Pai (e subcategorias)"><Trash2 className="w-4 h-4"[cite: 2]</button>
                  </div>
                </div>

                {/* Subcategorias (Filhos) */}
                {parent.isExpanded && children.length > 0 && (
                  <div className="bg-black/20 border-t border-zinc-900/50 divide-y divide-zinc-900/30 pl-10 pr-4">
                    {children.map((child) => (
                      <div key={child.id} className="flex items-center justify-between py-3 hover:bg-white/[0.01] transition-colors">
                        <div className="flex items-center space-x-2.5">
                          <Layers className="w-3.5 h-3.5 text-zinc-600" />
                          <span className="text-sm text-zinc-300 font-medium">{child.name}[cite: 2]</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button onClick={() => handleOpenEdit(child)} className="text-zinc-500 hover:text-white p-1 rounded transition-colors"><Edit2 className="w-3.5 h-3.5"[cite: 2]</button>
                          <button onClick={() => handleDelete(child.id)} className="text-zinc-600 hover:text-rose-400 p-1 rounded transition-colors"><Trash2 className="w-3.5 h-3.5"[cite: 2]</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Criar ou Editar Categoria */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Nova Categoria' : 'Editar Categoria'}[cite: 2]
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Preencha as propriedades de classificação[cite: 2].</p>
            </div>

            <div className="space-y-3.5">
              {/* Input Nome */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Nome da Categoria[cite: 2]</label>
                <input 
                  type="text" 
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Assinaturas de Streaming"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 outline-none text-sm rounded-xl px-3 py-2 text-zinc-100 placeholder-zinc-600"
                />
              </div>

              {/* Select Tipo */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Tipo de Fluxo[cite: 2]</label>
                <select 
                  value={catType}
                  onChange={(e) => setCatType(e.target.value as 'expense' | 'income')}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 outline-none text-sm rounded-xl px-3 py-2 text-zinc-300"
                >
                  <option value="expense">🛑 Despesa</option>
                  <option value="income">🟢 Receita</option>
                </select>
              </div>

              {/* Select Categoria Pai (Hierarquia) */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Categoria Superior (Opcional)</label>
                <select 
                  value={catParentId}
                  onChange={(e) => setCatParentId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 outline-none text-sm rounded-xl px-3 py-2 text-zinc-300"
                >
                  <option value="none">Nenhuma (Esta será uma Categoria Pai)</option>
                  {categories
                    .filter(c => c.type === catType && c.parent_id === null && c.id !== selectedId)
                    .map(c => (
                      <option key={c.id} value={c.id}>↳ {c.name}</option>
                    ))
                  }
                </select>
              </div>
            </div>

            {/* Ações */}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowModal(false)} className="w-full py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleSave} className="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-950/50 transition-colors">Salvar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}