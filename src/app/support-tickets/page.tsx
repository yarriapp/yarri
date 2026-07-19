"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type TicketStatus =
  | "open"
  | "waiting_on_support"
  | "waiting_on_user"
  | "resolved"
  | "closed";

type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketCategory = "account" | "safety" | "billing" | "technical" | "other";

type TicketRow = {
  id: string;
  ticket_number: number | string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  mode: "solo" | "duo" | "group";
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_admin_id: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_user_id: string;
  sender_role: "user" | "admin";
  message: string;
  created_at: string;
};

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Array<{ value: TicketStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "waiting_on_support", label: "Needs reply" },
  { value: "waiting_on_user", label: "Waiting on user" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const CATEGORY_OPTIONS: Array<{ value: TicketCategory | "all"; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "account", label: "Account" },
  { value: "safety", label: "Safety" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function statusLabel(status: TicketStatus) {
  if (status === "waiting_on_support") return "Needs reply";
  if (status === "waiting_on_user") return "Waiting on user";
  return status[0].toUpperCase() + status.slice(1);
}

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,()%_'"\\]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export default function SupportTicketsAdminPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("waiting_on_support");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [adminUserId, setAdminUserId] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || null,
    [selectedId, tickets]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email || !isAllowedAdminEmail(session.user.email)) {
        setTickets([]);
        setSelectedId("");
        setErrorMessage("Admin access required.");
        return;
      }

      setAdminUserId(session.user.id);

      let query = supabase
        .from("support_tickets")
        .select(
          "id, ticket_number, user_id, user_name, user_email, mode, category, subject, status, priority, assigned_admin_id, last_message_at, created_at, updated_at",
          { count: "exact" }
        );

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (categoryFilter !== "all") query = query.eq("category", categoryFilter);

      const cleanSearch = safeSearchTerm(searchTerm);
      if (cleanSearch) {
        query = query.or(
          `subject.ilike.%${cleanSearch}%,user_name.ilike.%${cleanSearch}%,user_email.ilike.%${cleanSearch}%`
        );
      }

      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query
        .order("last_message_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = (data || []) as TicketRow[];
      setTickets(rows);
      setTotalCount(count || 0);
      setSelectedId((current) =>
        current && rows.some((ticket) => ticket.id === current) ? current : rows[0]?.id || ""
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load support tickets.");
      setTickets([]);
      setSelectedId("");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, page, searchTerm, statusFilter]);

  const loadMessages = useCallback(async (ticketId: string) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, ticket_id, sender_user_id, sender_role, message, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data || []) as TicketMessage[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load the conversation.");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    void loadMessages(selectedId);
  }, [loadMessages, selectedId]);

  const applySearch = () => {
    setPage(1);
    setSearchTerm(searchInput.trim());
  };

  const updateTicket = async (updates: Partial<Pick<TicketRow, "status" | "priority">>) => {
    if (!selectedTicket) return;

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      const { error } = await supabase
        .from("support_tickets")
        .update(updates)
        .eq("id", selectedTicket.id);
      if (error) throw error;
      setSuccessMessage("Ticket updated.");
      await loadTickets();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update the ticket.");
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    const cleanReply = reply.trim();
    if (!cleanReply || !selectedTicket || !adminUserId) return;

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_user_id: adminUserId,
        sender_role: "admin",
        message: cleanReply,
      });

      if (error) throw error;
      setReply("");
      setSuccessMessage("Reply sent. The user was notified.");
      await Promise.all([loadTickets(), loadMessages(selectedTicket.id)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        <Header />

        <section className="admin-main-card" style={{ marginBottom: 18 }}>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Support Tickets</h2>
              <p className="admin-section-subtitle">
                Review private help requests, reply to users, and keep every case organized.
              </p>
            </div>
            <button type="button" className="admin-secondary-button" onClick={() => void loadTickets()}>
              Refresh
            </button>
          </div>

          <div className="support-ticket-filters">
            <select
              className="admin-input"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as TicketStatus | "all");
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              className="admin-input"
              value={categoryFilter}
              onChange={(event) => {
                setPage(1);
                setCategoryFilter(event.target.value as TicketCategory | "all");
              }}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              className="admin-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && applySearch()}
              placeholder="Search subject, name, or email"
              maxLength={80}
            />
            <button type="button" className="admin-primary-button" onClick={applySearch}>Search</button>
          </div>

          <div className="admin-list-count-row" style={{ marginTop: 14 }}>
            <span className="admin-list-count-primary">{totalCount} matching tickets</span>
            <span className="admin-list-count-filtered">Page {page} of {totalPages} · 50 per page</span>
          </div>
        </section>

        {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
        {successMessage ? <div className="admin-success-box">{successMessage}</div> : null}

        <section className="support-ticket-workspace">
          <div className="admin-main-card support-ticket-list-panel">
            {loading ? (
              <div className="admin-empty-card">
                <h3 className="admin-section-title">Loading support tickets...</h3>
              </div>
            ) : tickets.length === 0 ? (
              <div className="admin-empty-card">
                <h3 className="admin-section-title">No tickets found</h3>
                <p className="admin-section-subtitle">Try another status, category, or search.</p>
              </div>
            ) : (
              <div className="support-ticket-list">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    className={`support-ticket-list-item ${selectedId === ticket.id ? "support-ticket-list-item-active" : ""}`}
                    onClick={() => {
                      setSelectedId(ticket.id);
                      setReply("");
                      setSuccessMessage("");
                    }}
                  >
                    <span className="support-ticket-list-topline">
                      <span>#{ticket.ticket_number}</span>
                      <span className={`support-ticket-status support-ticket-status-${ticket.status}`}>
                        {statusLabel(ticket.status)}
                      </span>
                    </span>
                    <strong>{ticket.subject}</strong>
                    <span>{ticket.user_name || "Unknown member"} · {ticket.mode} · {ticket.category}</span>
                    <small>Updated {formatDate(ticket.last_message_at)}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="support-ticket-pagination">
              <button
                type="button"
                className="admin-secondary-button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="admin-secondary-button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="admin-main-card support-ticket-detail-panel">
            {!selectedTicket ? (
              <div className="admin-empty-card">
                <h3 className="admin-section-title">Select a ticket</h3>
                <p className="admin-section-subtitle">The private conversation will open here.</p>
              </div>
            ) : (
              <>
                <div className="support-ticket-detail-header">
                  <div>
                    <div className="admin-chip-row">
                      <span className="admin-tag">Ticket #{selectedTicket.ticket_number}</span>
                      <span className="admin-tag">{selectedTicket.category}</span>
                      <span className="admin-tag">{selectedTicket.mode}</span>
                    </div>
                    <h3 className="admin-section-title" style={{ marginTop: 10 }}>{selectedTicket.subject}</h3>
                    <p className="admin-section-subtitle">
                      {selectedTicket.user_name || "Unknown member"}
                      {selectedTicket.user_email ? ` · ${selectedTicket.user_email}` : ""}
                    </p>
                    <p className="admin-section-subtitle">Created {formatDate(selectedTicket.created_at)}</p>
                  </div>
                  <div className="support-ticket-controls">
                    <label>
                      <span>Status</span>
                      <select
                        className="admin-input"
                        value={selectedTicket.status}
                        disabled={saving}
                        onChange={(event) => void updateTicket({ status: event.target.value as TicketStatus })}
                      >
                        {STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Priority</span>
                      <select
                        className="admin-input"
                        value={selectedTicket.priority}
                        disabled={saving}
                        onChange={(event) => void updateTicket({ priority: event.target.value as TicketPriority })}
                      >
                        {PRIORITY_OPTIONS.map((priority) => (
                          <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="support-ticket-thread">
                  {loadingMessages ? (
                    <p className="admin-section-subtitle">Loading conversation...</p>
                  ) : messages.length === 0 ? (
                    <p className="admin-section-subtitle">No messages were found for this ticket.</p>
                  ) : (
                    messages.map((message) => (
                      <article
                        key={message.id}
                        className={`support-ticket-message support-ticket-message-${message.sender_role}`}
                      >
                        <div className="support-ticket-message-heading">
                          <strong>{message.sender_role === "admin" ? "Yarri Support" : selectedTicket.user_name || "Member"}</strong>
                          <span>{formatDate(message.created_at)}</span>
                        </div>
                        <p>{message.message}</p>
                      </article>
                    ))
                  )}
                </div>

                {selectedTicket.status === "closed" ? (
                  <div className="admin-empty-card">
                    <h3 className="admin-section-title">Ticket closed</h3>
                    <p className="admin-section-subtitle">Reopen it from the status control before sending another reply.</p>
                  </div>
                ) : (
                  <div className="support-ticket-reply-box">
                    <label htmlFor="support-ticket-reply">Reply to member</label>
                    <textarea
                      id="support-ticket-reply"
                      className="admin-textarea"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Write a clear support reply..."
                      maxLength={4000}
                      rows={5}
                      disabled={saving}
                    />
                    <div className="support-ticket-reply-footer">
                      <span>{reply.length}/4000 · Sends an app and push notification</span>
                      <button
                        type="button"
                        className="admin-primary-button"
                        onClick={() => void sendReply()}
                        disabled={saving || !reply.trim()}
                      >
                        {saving ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
