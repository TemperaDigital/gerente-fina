import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Plus, Folder, ChevronDown, ChevronRight, Edit2, Trash2, Tag, Layers, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { AppShell } from '@/components/app-shell';

export const Route = createFileRoute('/categories')({
  component: () => (
    <AppShell>
      <CategoriesComponent />
    </AppShell>
  ),
});


interface Category {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  isExpanded?: boolean;
}

function CategoriesComponent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [catParentId, setCatParentId] = useState<string>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Erro ao buscar categorias:', error.message);
    } else if (data) {
      const formatted = data.map((c: any) => ({ ...c, isExpanded: true }));
      setCategories(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const toggleExpand = (id: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, isExpanded: !c.isExpanded } : c));
  };

  const handleSave = async () => {
    if (!catName.trim()) return;

    const payload = {
      name: catName,
      type: catType,
      parent_id: catParentId === 'none' ? null : catParentId,
    };

    if (modalMode === 'create') {
      const { error } = await supabase.from('categories').insert([payload]);
      if (error) alert('Erro ao criar: ' + error.message);
    } else if (modalMode === 'edit' && selectedId) {
      const { error } = await supabase.from('categories').update(payload).eq('id', selectedId);
      if (error) alert('Erro ao atualizar: ' + error.message);
    }

    setShowModal(false);
    fetchCategories();
  };

  const handleDelete = async (id: string) => {
    const confirm = window.confirm("Deseja mesmo excluir esta categoria?");
    if (!confirm) return;

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) alert('Erro ao deletar: ' + error.message);
    else fetchCategories();
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setCatName('');
    setCatType(activeTab);
    setCatParentId('none');
    setShowModal(true);
  };

  const handleOpenEdit = (category: Category) => {
    setModalMode('edit');
    setSelectedId(category.id);
    setCatName(category.name);
    setCatType(category.type as 'expense' | 'income');
    setCatParentId(category.parent_id || 'none');
    setShowModal(true);
  };

  const rootCategories = categories.filter(c => c.type === activeTab && c.parent_id === null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">Categorias em Tempo Real</h1>
          <p className="text-sm text-zinc-400 mt-1">Dados conectados diretamente à infraestrutura do seu Supabase.</p>
        </div>
        <button onClick={handleOpenCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      <div className="flex border-b border-zinc-900 max-w-xs bg-white/[0.02] p-1 rounded-xl border border-white/[0.04]">
        <button onClick={() => setActiveTab('expense')} className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === 'expense' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500'}`}>🛑 Despesas</button>
        <button onClick={() => setActiveTab('income')} className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === 'income' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500'}`}>🟢 Receitas</button>
      </div>

      <div className="max-w-3xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl min-h-[150px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
            <span className="text-sm font-medium">Lendo tabelas do Supabase...</span>
          </div>
        ) : rootCategories.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 space-y-1">
            <Tag className="w-10 h-10 mx-auto opacity-20" />
            <p className="text-sm">Nenhuma categoria encontrada no banco de dados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rootCategories.map((parent) => {
              const children = categories.filter(c => c.parent_id === parent.id);
              return (
                <div key={parent.id} className="border border-zinc-900 rounded-xl bg-zinc-900/20 overflow-hidden">
                  <div className="flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => toggleExpand(parent.id)} disabled={children.length === 0} className={`text-zinc-500 hover:text-white ${children.length === 0 ? 'opacity-20 cursor-not-allowed' : ''}`}>
                        {parent.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <Folder className="w-5 h-5 text-indigo-400" />
                      <span className="font-semibold text-zinc-200 text-sm">{parent.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleOpenEdit(parent)} className="text-zinc-500 hover:text-white p-1.5 rounded"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(parent.id)} className="text-zinc-600 hover:text-rose-400 p-1.5 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {parent.isExpanded && children.length > 0 && (
                    <div className="bg-black/20 border-t border-zinc-900/50 divide-y divide-zinc-900/30 pl-10 pr-4">
                      {children.map((child) => (
                        <div key={child.id} className="flex items-center justify-between py-3 hover:bg-white/[0.01] transition-colors">
                          <div className="flex items-center space-x-2.5">
                            <Layers className="w-3.5 h-3.5 text-zinc-600" />
                            <span className="text-sm text-zinc-300 font-medium">{child.name}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button onClick={() => handleOpenEdit(child)} className="text-zinc-500 hover:text-white p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDelete(child.id)} className="text-zinc-600 hover:text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">{modalMode === 'create' ? 'Nova Categoria' : 'Editar Categoria'}</h3>
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Nome no Banco</label>
                <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Softwares" className="w-full bg-zinc-950 border border-zinc-800 outline-none text-sm rounded-xl px-3 py-2 text-zinc-100" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Tipo de Fluxo</label>
                <select value={catType} onChange={(e) => setCatType(e.target.value as 'expense' | 'income')} className="w-full bg-zinc-950 border border-zinc-800 outline-none text-sm rounded-xl px-3 py-2 text-zinc-300">
                  <option value="expense">🛑 Despesa</option>
                  <option value="income">🟢 Receita</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Categoria Superior</label>
                <select value={catParentId} onChange={(e) => setCatParentId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 outline-none text-sm rounded-xl px-3 py-2 text-zinc-300">
                  <option value="none">Nenhuma (Esta será uma Categoria Pai)</option>
                  {categories.filter(c => c.type === catType && c.parent_id === null && c.id !== selectedId).map(c => (
                    <option key={c.id} value={c.id}>↳ {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowModal(false)} className="w-full py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold rounded-xl">Cancelar</button>
              <button onClick={handleSave} className="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}