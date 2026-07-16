"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";

type Interest = {
  id: string;
  name: string;
  category: string;
  created_at: string;
};

type PromptCard = {
  id: string;
  question: string;
  category: string;
  created_at: string;
};

export default function AdminInterestsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [activeTab, setActiveTab] = useState<"interests" | "prompts">("interests");
  
  const [interests, setInterests] = useState<Interest[]>([]);
  const [prompts, setPrompts] = useState<PromptCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [saving, setSaving] = useState(false);

  const loadInterests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("interests")
      .select("*")
      .order("name", { ascending: true });
    if (!error) setInterests(data || []);
    setLoading(false);
  }, []);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prompt_cards")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setPrompts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const verifyAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.toLowerCase() ?? "";
      if (!email || !isAllowedAdminEmail(email)) {
        router.replace("/admin");
      } else {
        setCheckingAccess(false);
      }
    };
    verifyAccess();
  }, [router]);

  useEffect(() => {
    if (checkingAccess) return;
    queueMicrotask(() => {
      if (activeTab === "interests") void loadInterests();
      else void loadPrompts();
    });
  }, [checkingAccess, activeTab, loadInterests, loadPrompts]);

  const addItem = async () => {
    if (!newName) return;
    setSaving(true);
    
    if (activeTab === "interests") {
      const { error } = await supabase.from("interests").insert({
        name: newName,
        category: newCategory
      });
      if (!error) {
        setNewName("");
        loadInterests();
      }
    } else {
      const { error } = await supabase.from("prompt_cards").insert({
        question: newName,
        category: newCategory
      });
      if (!error) {
        setNewName("");
        loadPrompts();
      }
    }
    setSaving(false);
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    const table = activeTab === "interests" ? "interests" : "prompt_cards";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) {
      if (activeTab === "interests") loadInterests();
      else loadPrompts();
    }
  };

  if (checkingAccess) return <div className="p-10">Checking access...</div>;

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <div className="admin-tabs-row" style={{ marginBottom: '20px' }}>
            <button 
                className={`admin-tab-button ${activeTab === "interests" ? "admin-tab-button-active" : ""}`}
                onClick={() => setActiveTab("interests")}
            >
                Interests List
            </button>
            <button 
                className={`admin-tab-button ${activeTab === "prompts" ? "admin-tab-button-active" : ""}`}
                onClick={() => setActiveTab("prompts")}
            >
                Prompt Cards
            </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <section className="admin-main-card">
            <h2 className="admin-section-title">Add New {activeTab === "interests" ? "Interest" : "Prompt"}</h2>
            <div className="admin-field" style={{ marginTop: 15 }}>
              <label className="admin-label">{activeTab === "interests" ? "Interest Name" : "Prompt Question"}</label>
              <input 
                className="admin-input" 
                placeholder={activeTab === "interests" ? "e.g. Hiking" : "e.g. My favorite travel story is..."} 
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div className="admin-field" style={{ marginTop: 15 }}>
              <label className="admin-label">Category</label>
              <input 
                className="admin-input" 
                placeholder="e.g. Lifestyle, Travel" 
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
              />
            </div>

            <button 
              onClick={addItem} 
              disabled={saving}
              className="admin-primary-button" 
              style={{ marginTop: 25, width: '100%' }}
            >
              {saving ? "Adding..." : "Add to List"}
            </button>
          </section>

          <section className="admin-main-card">
            <h2 className="admin-section-title">Current {activeTab === "interests" ? "Interests" : "Prompts"}</h2>
            {loading ? (
              <p>Loading...</p>
            ) : (activeTab === "interests" ? interests : prompts).length === 0 ? (
              <p>No items found.</p>
            ) : (
              <div className="admin-user-list">
                {(activeTab === "interests" ? interests : prompts).map((item) => (
                  <div key={item.id} className="admin-user-card" style={{ cursor: 'default' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>
                        <h3 style={{ fontWeight: 'bold' }}>
                          {"name" in item ? item.name : item.question}
                        </h3>
                        <p style={{ fontSize: 12, color: '#666' }}>Category: {item.category}</p>
                      </div>
                      <button 
                        onClick={() => deleteItem(item.id)}
                        style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold', border: 'none', background: 'none', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
