import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileText,
  FileUp,
  Image,
  KeyRound,
  LayoutList,
  Lock,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Moon,
  Paperclip,
  Palette,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Smile,
  Sun,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { ApiError, api } from "./api";
import type { Attachment, Conversation, Invitation, Member, Message, NotificationLevel, Theme, User, UserSettings } from "./types";

type Nav = "all" | "private" | "senates" | "invites" | "archived" | "settings" | "admin";
type SettingsSection = "account" | "privacy" | "notifications" | "appearance" | "storage";

const DEFAULT_SETTINGS: UserSettings = {
  userId: "",
  theme: "light",
  reduceMotion: false,
  readReceipts: true,
  showOnlineStatus: true,
  soundEnabled: true,
  toastsEnabled: true,
  badgesEnabled: true,
  updatedAt: ""
};

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Avatar({ name, photoPath, senate = false, large = false }: { name: string; photoPath?: string | null; senate?: boolean; large?: boolean }) {
  return <span className={`avatar ${large ? "avatar-large" : ""} ${senate ? "avatar-senate" : ""}`}>{photoPath ? <img src={photoPath} alt="" /> : senate ? <Users size={large ? 30 : 18} strokeWidth={1.75} /> : name.slice(0, 2).toUpperCase()}</span>;
}

function IconButton({ label, children, onClick, active = false, danger = false, disabled = false }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return <button className={`icon-button ${active ? "active" : ""} ${danger ? "danger" : ""}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = mode === "login" ? await api.login({ phone, password }) : await api.register({ phone, password, displayName });
      onAuth(payload.user);
    } catch (err) { setError(err instanceof Error ? err.message : "Giriş başarısız."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-panel"><div className="brand-lockup"><span className="brand-crest"><Shield size={24} /></span><div><h1>SenatoRoom</h1><p>Üyeler için güvenli iletişim alanı</p></div></div><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Giriş yap</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Kayıt ol</button></div><form className="auth-form" onSubmit={submit}>{mode === "register" ? <label>Ad soyad<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required /></label> : null}<label>Telefon<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" placeholder="5533772732" required /></label><label>Parola<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required /></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-button" disabled={busy}>{busy ? "İşleniyor…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}</button></form></section></main>;
}

function AppSidebar({ active, user, inviteCount, unreadCount, onNavigate, onLogout }: { active: Nav; user: User; inviteCount: number; unreadCount: number; onNavigate: (value: Nav) => void; onLogout: () => void }) {
  const items: Array<{ id: Nav; label: string; icon: typeof LayoutList; count?: number }> = [
    { id: "all", label: "Tümü", icon: LayoutList, count: unreadCount },
    { id: "private", label: "Özel", icon: MessageCircle },
    { id: "senates", label: "Senatolar", icon: Users },
    { id: "invites", label: "Davetler", icon: UserPlus, count: inviteCount },
    { id: "archived", label: "Arşiv", icon: Archive },
    { id: "settings", label: "Ayarlar", icon: Settings }
  ];
  if (user.adminAccess) items.push({ id: "admin", label: "Yönetim", icon: Shield });
  return <aside className="app-sidebar"><div className="sidebar-brand"><span className="brand-crest"><Shield size={22} /></span><strong>SenatoRoom</strong></div><nav aria-label="Ana menü">{items.map((item) => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? "selected" : ""} onClick={() => onNavigate(item.id)}><span><Icon size={20} strokeWidth={1.75} />{item.count ? <i>{item.count > 99 ? "99+" : item.count}</i> : null}</span><b>{item.label}</b></button>; })}</nav><div className="sidebar-account"><Avatar name={user.displayName} photoPath={user.photoPath} /><div><strong>{user.displayName}</strong><span>Hesap ayarları</span></div><IconButton label="Çıkış yap" onClick={onLogout}><LogOut size={18} /></IconButton></div></aside>;
}

function ConversationList({ conversations, selectedId, active, onSelect, onCreate }: { conversations: Conversation[]; selectedId: string | null; active: Nav; onSelect: (id: string) => void; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => conversations.filter((conversation) => {
    const matchesType = active === "private" ? conversation.type === "dm" : active === "senates" ? conversation.type === "senate" : true;
    return matchesType && `${conversation.title} ${conversation.latestMessage?.body ?? ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
  }), [active, conversations, query]);
  const title = active === "private" ? "Özel" : active === "senates" ? "Senatolar" : active === "archived" ? "Arşiv" : "Tüm sohbetler";
  return <section className="conversation-list"><header className="list-heading"><div><h1>{title}</h1><p>{visible.length} sohbet</p></div><IconButton label="Yeni sohbet" onClick={onCreate}><Plus size={20} /></IconButton></header><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sohbetlerde ara" /></label><div className="thread-list">{visible.map((conversation) => <button key={conversation.id} className={`thread-row ${selectedId === conversation.id ? "selected" : ""}`} onClick={() => onSelect(conversation.id)}><Avatar name={conversation.title} photoPath={conversation.photoPath} senate={conversation.type === "senate"} /><span className="thread-copy"><span><strong>{conversation.title}</strong><time>{formatTime(conversation.latestMessage?.createdAt)}</time></span><small>{conversation.latestMessage?.body || "Henüz mesaj yok"}</small></span>{conversation.unreadCount ? <i className="unread-count">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</i> : null}</button>)}{!visible.length ? <div className="list-empty"><MessageCircle size={28} /><p>Gösterilecek sohbet yok.</p></div> : null}</div></section>;
}

function AttachmentView({ attachment, onOpenImage }: { attachment: Attachment; onOpenImage: (attachment: Attachment) => void }) {
  if (attachment.mimeType.startsWith("image/") && attachment.previewUrl) return <button className="message-image" type="button" onClick={() => onOpenImage(attachment)} aria-label={`${attachment.originalName} görselini büyüt`}><img src={attachment.previewUrl} alt={attachment.originalName} /></button>;
  if (attachment.mimeType.startsWith("video/") && attachment.previewUrl) return <video className="message-video" controls preload="metadata" playsInline aria-label={attachment.originalName}><source src={attachment.previewUrl} type={attachment.mimeType} />Tarayıcınız bu videoyu oynatmayı desteklemiyor.</video>;
  return <a className="attachment-card" href={attachment.url} target="_blank" rel="noreferrer"><FileText size={20} /><span><b>{attachment.originalName}</b><small>{fileSize(attachment.size)}</small></span><Download size={18} /></a>;
}

function ChatPanel({ user, conversation, messages, hasMore, onLoadOlder, onSend, onUpload, onEdit, onDelete, onReact, onUnreact, onOpenSettings, onOpenSenate, onSearch, onMarkRead }: {
  user: User; conversation: Conversation | null; messages: Message[]; hasMore: boolean; onLoadOlder: () => Promise<void>; onSend: (body: string, attachmentIds: string[], replyId?: string | null) => Promise<boolean>; onUpload: (file: File) => Promise<Attachment>; onEdit: (id: string, body: string) => void; onDelete: (id: string) => void; onReact: (id: string, emoji: string) => void; onUnreact: (id: string, emoji: string) => void; onOpenSettings: () => void; onOpenSenate: () => void; onSearch: () => void; onMarkRead: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousFirstMessageIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const shouldScrollToBottomRef = useRef(false);
  const restoringScrollRef = useRef<{ height: number; top: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const markedMessageIdsRef = useRef(new Set<string>());
  useEffect(() => { setBody(""); setPending([]); setReply(null); setEditing(null); setPreviewImage(null); markedMessageIdsRef.current = new Set(); }, [conversation?.id]);
  useEffect(() => {
    if (!previewImage) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewImage(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewImage]);
  useEffect(() => {
    messages
      .filter((message) => message.senderId !== user.id && !markedMessageIdsRef.current.has(message.id))
      .forEach((message) => { markedMessageIdsRef.current.add(message.id); onMarkRead(message.id); });
  }, [messages, onMarkRead, user.id]);
  useLayoutEffect(() => {
    if (!conversation || !streamRef.current) return;
    const stream = streamRef.current;
    const scrollSnapshot = restoringScrollRef.current;
    if (scrollSnapshot) {
      stream.scrollTop = scrollSnapshot.top + stream.scrollHeight - scrollSnapshot.height;
      restoringScrollRef.current = null;
    }
    const firstMessageId = messages[0]?.id ?? null;
    const conversationChanged = previousConversationIdRef.current !== conversation.id;
    const loadedOlderMessages = Boolean(
      previousFirstMessageIdRef.current
      && firstMessageId !== previousFirstMessageIdRef.current
      && messages.some((message) => message.id === previousFirstMessageIdRef.current)
    );
    if (conversationChanged) shouldScrollToBottomRef.current = true;
    if (shouldScrollToBottomRef.current || (!loadedOlderMessages && messages.length > previousMessageCountRef.current)) {
      stream.scrollTop = stream.scrollHeight;
      shouldScrollToBottomRef.current = false;
    }
    previousConversationIdRef.current = conversation.id;
    previousFirstMessageIdRef.current = firstMessageId;
    previousMessageCountRef.current = messages.length;
  }, [conversation, messages]);
  const loadOlderMessages = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream || !hasMore || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    restoringScrollRef.current = { height: stream.scrollHeight, top: stream.scrollTop };
    try {
      await onLoadOlder();
    } catch {
      restoringScrollRef.current = null;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [hasMore, onLoadOlder]);
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const handleScroll = () => {
      if (stream.scrollTop <= 80) void loadOlderMessages();
    };
    stream.addEventListener("scroll", handleScroll, { passive: true });
    return () => stream.removeEventListener("scroll", handleScroll);
  }, [loadOlderMessages]);
  if (!conversation) return <section className="empty-chat"><span className="empty-chat-icon"><MessageCircle size={32} /></span><h2>Bir sohbet seçin</h2><p>Özel üyelerle veya davetli senatolarla güvenli şekilde iletişim kurun.</p></section>;
  async function upload(file?: File) {
    if (!file) return;
    setUploadError("");
    try { const attachment = await onUpload(file); setPending((items) => [...items, attachment]); } catch (err) { setUploadError(err instanceof Error ? err.message : "Dosya yüklenemedi."); }
  }
  async function submit() {
    if (!body.trim() && !pending.length) return;
    const sent = await onSend(body, pending.map((item) => item.id), reply?.id);
    if (sent) { setBody(""); setPending([]); setReply(null); }
  }
  let previousDate = "";
  return <section className="chat-panel"><header className="chat-header"><div className="chat-identity"><Avatar name={conversation.title} photoPath={conversation.photoPath} senate={conversation.type === "senate"} /><div><h2>{conversation.title}</h2><p>{conversation.type === "senate" ? `${conversation.members.length} üye` : conversation.mutedUntil ? "Bildirimler sessizde" : "Özel konuşma"}</p></div></div><div className="chat-actions"><IconButton label="Sohbette ara" onClick={onSearch}><Search size={19} /></IconButton><IconButton label={conversation.type === "senate" ? "Senato bilgileri" : "Sohbet ayarları"} onClick={conversation.type === "senate" ? onOpenSenate : onOpenSettings}><MoreHorizontal size={20} /></IconButton></div></header><div className="message-stream" ref={streamRef}>{hasMore ? <span className="load-older" aria-live="polite">Eski mesajlar için yukarı kaydırın</span> : null}{messages.map((message) => { const date = new Date(message.createdAt).toDateString(); const showDate = date !== previousDate; previousDate = date; const mine = message.senderId === user.id; const isEditing = editing?.id === message.id; return <div key={message.id}>{showDate ? <div className="date-divider"><span>{formatDate(message.createdAt)}</span></div> : null}<article className={`message ${mine ? "mine" : ""}`}><div className="message-avatar">{!mine ? <Avatar name={message.senderName} /> : null}</div><div className="message-stack">{!mine && conversation.type === "senate" ? <strong className="message-sender">{message.senderName}</strong> : null}<div className="message-bubble">{message.replyTo ? <div className="reply-preview"><b>{message.replyTo.senderName}</b><span>{message.replyTo.body}</span></div> : null}{message.deletedAt ? <em>Bu mesaj silindi.</em> : isEditing ? <div className="message-editor"><textarea value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} /><div><button onClick={() => setEditing(null)}>İptal</button><button onClick={() => { if (editing.body.trim()) { onEdit(message.id, editing.body); setEditing(null); } }}>Kaydet</button></div></div> : <p>{message.body}</p>}{message.attachments.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} onOpenImage={setPreviewImage} />)}<footer><span>{formatTime(message.createdAt)}</span>{message.editedAt ? <span>düzenlendi</span> : null}{mine ? message.readCount > 1 ? <CheckCheck size={15} /> : <Check size={15} /> : null}</footer></div>{!message.deletedAt ? <div className="reaction-row">{message.reactions.map((reaction) => <button key={reaction.emoji} className={reaction.reacted ? "reacted" : ""} onClick={() => reaction.reacted ? onUnreact(message.id, reaction.emoji) : onReact(message.id, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}<button className="quick-reaction" aria-label="Beğen" onClick={() => onReact(message.id, "👍")}><Smile size={15} /></button></div> : null}</div><div className="message-menu-wrap">{!message.deletedAt ? <IconButton label="Mesaj işlemleri" onClick={() => setMenuId(menuId === message.id ? null : message.id)}><MoreHorizontal size={17} /></IconButton> : null}{menuId === message.id ? <div className="message-menu"><button onClick={() => { setReply(message); setMenuId(null); }}>Yanıtla</button>{mine ? <><button onClick={() => { setEditing({ id: message.id, body: message.body }); setMenuId(null); }}>Düzenle</button><button className="danger-text" onClick={() => { onDelete(message.id); setMenuId(null); }}>Sil</button></> : null}</div> : null}</div></article></div>; })}</div>{pending.length ? <div className="pending-files">{pending.map((item) => <span key={item.id}><Paperclip size={15} />{item.originalName}<button onClick={() => setPending((current) => current.filter((pendingItem) => pendingItem.id !== item.id))}><X size={14} /></button></span>)}</div> : null}{reply ? <div className="composer-reply"><div><b>{reply.senderName} mesajına yanıt</b><span>{reply.body}</span></div><IconButton label="Yanıtı kaldır" onClick={() => setReply(null)}><X size={17} /></IconButton></div> : null}{uploadError ? <p className="composer-error">{uploadError}</p> : null}<footer className="composer"><input ref={fileRef} hidden type="file" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} /><IconButton label="Dosya ekle" onClick={() => fileRef.current?.click()}><FileUp size={19} /></IconButton><textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Mesaj yazın" /><IconButton label="Gönder" onClick={() => void submit()} active><Send size={19} /></IconButton></footer>{previewImage?.previewUrl ? <div className="image-preview-backdrop" role="presentation" onClick={() => setPreviewImage(null)}><section className="image-preview-modal" role="dialog" aria-modal="true" aria-label={previewImage.originalName} onClick={(event) => event.stopPropagation()}><header><span>{previewImage.originalName}</span><IconButton label="Görsel önizlemeyi kapat" onClick={() => setPreviewImage(null)}><X size={20} /></IconButton></header><img src={previewImage.previewUrl} alt={previewImage.originalName} /></section></div> : null}</section>;
}

function SearchDrawer({ open, conversation, onClose, onSearch }: { open: boolean; conversation: Conversation | null; onClose: () => void; onSearch: (query: string) => Promise<Message[]> }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Message[]>([]); const [error, setError] = useState("");
  useEffect(() => { if (!open) { setQuery(""); setResults([]); setError(""); } }, [open]);
  if (!open || !conversation) return null;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer search-drawer" onClick={(event) => event.stopPropagation()} aria-label="Sohbette ara"><header><div><h2>Sohbette ara</h2><p>{conversation.title}</p></div><IconButton label="Kapat" onClick={onClose}><X size={19} /></IconButton></header><form className="drawer-search" onSubmit={(event) => { event.preventDefault(); if (query.trim().length < 2) return; onSearch(query).then(setResults).catch((err: unknown) => setError(err instanceof Error ? err.message : "Arama yapılamadı.")); }}><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mesajlarda ara" /><button>Bul</button></form>{error ? <p className="form-error">{error}</p> : null}<div className="search-results">{results.map((message) => <article key={message.id}><b>{message.senderName}</b><p>{message.body}</p><time>{formatDate(message.createdAt)} · {formatTime(message.createdAt)}</time></article>)}{query && !results.length && !error ? <p className="muted-copy">En az iki karakterle arama yapın.</p> : null}</div></aside></div>;
}

function ConversationSettingsDrawer({ open, conversation, onClose, onUpdate, onBlock, onSearch }: { open: boolean; conversation: Conversation | null; onClose: () => void; onUpdate: (input: { notificationLevel?: NotificationLevel; mutedUntil?: string | null; archived?: boolean; clear?: boolean }) => void; onBlock: (memberId: string) => void; onSearch: () => void }) {
  const [media, setMedia] = useState<Attachment[]>([]);
  const [blockedMemberIds, setBlockedMemberIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open || !conversation) return;
    let cancelled = false;
    void Promise.all([api.media(conversation.id), api.blocks()])
      .then(([{ attachments }, { members }]) => {
        if (cancelled) return;
        setMedia(attachments);
        setBlockedMemberIds(new Set(members.map((member) => member.id)));
      })
      .catch(() => {
        if (!cancelled) {
          setMedia([]);
          setBlockedMemberIds(new Set());
        }
      });
    return () => { cancelled = true; };
  }, [conversation?.id, open]);

  if (!open || !conversation) return null;
  const other = conversation.members.find((member) => member.id !== conversation.viewerId);
  const muted = Boolean(conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date());
  const isOtherBlocked = Boolean(other && blockedMemberIds.has(other.id));
  const toggleBlock = () => {
    if (!other) return;
    if (!isOtherBlocked) {
      if (window.confirm("Bu üyeyi engellemek istiyor musunuz?")) onBlock(other.id);
      return;
    }
    if (!window.confirm("Bu üyenin engelini kaldırmak istiyor musunuz?")) return;
    void api.unblock(other.id).then(() => {
      setBlockedMemberIds((current) => {
        const next = new Set(current);
        next.delete(other.id);
        return next;
      });
    }).catch(() => undefined);
  };

  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer conversation-settings" onClick={(event) => event.stopPropagation()} aria-label="Sohbet ayarları"><header><div><h2>Sohbet ayarları</h2><p>Bu konuşmaya özel tercihler</p></div><IconButton label="Kapat" onClick={onClose}><X size={19} /></IconButton></header><div className="drawer-profile"><Avatar name={conversation.title} photoPath={conversation.photoPath} large /><div><strong>{conversation.title}</strong><span>{conversation.type === "senate" ? `${conversation.members.length} üye` : "Özel konuşma"}</span></div></div><section className="settings-rows"><label className="setting-row"><span><Bell size={19} /><b>Bildirimler</b></span><select value={conversation.notificationLevel} onChange={(event) => onUpdate({ notificationLevel: event.target.value as NotificationLevel })}><option value="all">Tümü</option><option value="mentions">Yalnızca bahsetmeler</option><option value="none">Kapalı</option></select></label><button className="setting-row" onClick={() => onUpdate({ mutedUntil: muted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })}><span>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}<b>{muted ? "Sessizi kaldır" : "8 saat sessize al"}</b></span><ChevronRight size={18} /></button><button className="setting-row" onClick={onSearch}><span><Search size={19} /><b>Sohbette ara</b></span><ChevronRight size={18} /></button><button className="setting-row"><span><Image size={19} /><b>Paylaşılan medya</b></span><small>{media.length} dosya</small></button></section><section className="settings-rows danger-section"><button className="setting-row" onClick={() => onUpdate({ archived: !conversation.archivedAt })}><span><Archive size={19} /><b>{conversation.archivedAt ? "Arşivden çıkar" : "Sohbeti arşivle"}</b></span><ChevronRight size={18} /></button><button className="setting-row" onClick={() => { if (window.confirm("Sohbet geçmişi yalnızca sizin görünümünüzden kaldırılacak.")) onUpdate({ clear: true, archived: true }); }}><span><Trash2 size={19} /><b>Sohbeti sil</b></span><ChevronRight size={18} /></button>{conversation.type === "dm" && other ? <button className="setting-row danger-row" onClick={toggleBlock}><span><ShieldAlert size={19} /><b>{isOtherBlocked ? "Engeli kaldır" : "Engelle"}</b></span><ChevronRight size={18} /></button> : null}</section></aside></div>;
}

function NewConversationDrawer({ open, onClose, onSearch, onCreateDm, onCreateSenate }: { open: boolean; onClose: () => void; onSearch: (query: string) => Promise<Member[]>; onCreateDm: (id: string) => void; onCreateSenate: (input: { name: string; description: string; memberIds: string[] }) => void }) {
  const [query, setQuery] = useState(""); const [members, setMembers] = useState<Member[]>([]); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (!query.trim()) { setMembers([]); return; } const timer = window.setTimeout(() => { onSearch(query).then(setMembers).catch(() => setMembers([])); }, 250); return () => window.clearTimeout(timer); }, [onSearch, query]);
  useEffect(() => { if (!open) { setQuery(""); setMembers([]); setName(""); setDescription(""); setSelected([]); } }, [open]);
  if (!open) return null;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer create-drawer" onClick={(event) => event.stopPropagation()}><header><div><h2>Yeni sohbet</h2><p>Üye bulun veya senato oluşturun</p></div><IconButton label="Kapat" onClick={onClose}><X size={19} /></IconButton></header><section><h3>Özel sohbet</h3><label className="drawer-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İsim veya telefon ara" /></label><div className="member-results">{members.map((member) => <button key={member.id} onClick={() => onCreateDm(member.id)}><Avatar name={member.displayName} photoPath={member.photoPath} /><span><b>{member.displayName}</b><small>{member.phone}</small></span><ChevronRight size={18} /></button>)}</div></section><section className="create-senate"><h3>Senato oluştur</h3><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Senato adı" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Açıklama (isteğe bağlı)" /><p>Üyeleri arama sonuçlarından seçin.</p><div className="member-results selectable">{members.map((member) => <label key={`select-${member.id}`}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><Avatar name={member.displayName} photoPath={member.photoPath} /><span><b>{member.displayName}</b><small>{member.phone}</small></span></label>)}</div><button className="primary-button" disabled={!name.trim()} onClick={() => onCreateSenate({ name, description, memberIds: selected })}>Senatoyu oluştur</button></section></aside></div>;
}

function SenateDrawer({ open, conversation, user, onClose, onSave, onInvite, onPermission, onRemove, onLeave, onTransfer, onDelete }: { open: boolean; conversation: Conversation | null; user: User; onClose: () => void; onSave: (name: string, description: string) => void; onInvite: (id: string) => void; onPermission: (id: string, value: boolean) => void; onRemove: (id: string) => void; onLeave: () => void; onTransfer: (id: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  useEffect(() => { setName(conversation?.title ?? ""); setDescription(conversation?.description ?? ""); }, [conversation]);
  if (!open || !conversation || conversation.type !== "senate") return null;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer senate-drawer" onClick={(event) => event.stopPropagation()}><header><div><h2>Senato bilgileri</h2><p>{conversation.members.length} üye</p></div><IconButton label="Kapat" onClick={onClose}><X size={19} /></IconButton></header><div className="drawer-profile"><Avatar name={conversation.title} photoPath={conversation.photoPath} senate large /><div><strong>{conversation.title}</strong><span>{conversation.description || "Açıklama eklenmemiş."}</span></div></div>{conversation.canEdit ? <section className="drawer-form"><h3>Grup bilgileri</h3><input value={name} onChange={(event) => setName(event.target.value)} /><textarea value={description} onChange={(event) => setDescription(event.target.value)} /><button className="secondary-button" onClick={() => onSave(name, description)}>Değişiklikleri kaydet</button></section> : null}<section className="member-management"><h3>Üyeler</h3>{conversation.members.map((member) => <div key={member.id} className="member-row"><Avatar name={member.displayName} photoPath={member.photoPath} /><span><b>{member.displayName}</b><small>{member.id === conversation.createdById ? "Kurucu" : member.canInvite ? "Davet yetkisi var" : "Üye"}</small></span>{conversation.canEdit && member.id !== user.id ? <div className="member-actions"><button title="Davet yetkisi" onClick={() => onPermission(member.id, !member.canInvite)}><UserPlus size={16} /></button><button title="Kuruculuğu devret" onClick={() => { if (window.confirm(`${member.displayName} kurucu olsun mu?`)) onTransfer(member.id); }}><Shield size={16} /></button><button title="Üyeyi çıkar" onClick={() => { if (window.confirm(`${member.displayName} çıkarılsın mı?`)) onRemove(member.id); }}><UserMinus size={16} /></button></div> : null}</div>)}</section><section className="settings-rows danger-section">{!conversation.canEdit ? <button className="setting-row" onClick={onLeave}><span><ArrowLeft size={19} /><b>Senatodan ayrıl</b></span><ChevronRight size={18} /></button> : null}{conversation.canEdit ? <button className="setting-row danger-row" onClick={() => { if (window.confirm("Bu senato ve tüm mesajları kalıcı olarak silinecek.")) onDelete(); }}><span><Trash2 size={19} /><b>Senatoyu sil</b></span><ChevronRight size={18} /></button> : null}</section></aside></div>;
}

function InvitesPanel({ invites, onRespond }: { invites: Invitation[]; onRespond: (id: string, action: "accept" | "decline" | "block") => void }) {
  return <section className="full-page-panel"><header className="page-header"><div><h1>Davetler</h1><p>{invites.length ? `${invites.length} bekleyen davet` : "Bekleyen davet yok"}</p></div></header><div className="invite-list">{invites.map((invite) => <article key={invite.id} className="invite-card"><Avatar name={invite.name} photoPath={invite.photoPath} senate large /><div><h2>{invite.name}</h2><p>{invite.invitedByName} sizi davet etti · {invite.memberCount} üye</p>{invite.description ? <p>{invite.description}</p> : null}</div><div className="invite-actions"><button className="primary-button" onClick={() => onRespond(invite.id, "accept")}>Kabul et</button><button className="secondary-button" onClick={() => onRespond(invite.id, "decline")}>Reddet</button><button className="text-danger" onClick={() => onRespond(invite.id, "block")}>Engelle</button></div></article>)}{!invites.length ? <div className="empty-page"><UserPlus size={32} /><h2>Bekleyen davet yok</h2><p>Yeni davetler burada görünür.</p></div> : null}</div></section>;
}

function SettingsView({ user, settings, onSettings, onProfile, onPhoto, onPassword, onDeleteAccount }: { user: User; settings: UserSettings; onSettings: (input: Partial<Omit<UserSettings, "userId" | "updatedAt">>) => void; onProfile: (displayName: string, bio: string) => void; onPhoto: (file: File) => void; onPassword: (current: string, next: string) => void; onDeleteAccount: (password: string) => void }) {
  const [section, setSection] = useState<SettingsSection>("account"); const [name, setName] = useState(user.displayName); const [bio, setBio] = useState(user.bio); const [currentPassword, setCurrentPassword] = useState(""); const [nextPassword, setNextPassword] = useState(""); const [deletePassword, setDeletePassword] = useState(""); const [blocked, setBlocked] = useState<Member[]>([]); const photoRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setName(user.displayName); setBio(user.bio); }, [user]);
  useEffect(() => { if (section === "privacy") api.blocks().then(({ members }) => setBlocked(members)).catch(() => setBlocked([])); }, [section]);
  const rows: Array<{ id: SettingsSection; label: string; icon: typeof KeyRound }> = [{ id: "account", label: "Hesap", icon: KeyRound }, { id: "privacy", label: "Gizlilik", icon: Lock }, { id: "notifications", label: "Bildirimler", icon: Bell }, { id: "appearance", label: "Görünüm", icon: Palette }, { id: "storage", label: "Veri ve depolama", icon: Database }];
  return <section className="settings-page"><aside className="settings-rail"><header><h1>Ayarlar</h1></header>{rows.map((row) => { const Icon = row.icon; return <button key={row.id} className={section === row.id ? "selected" : ""} onClick={() => setSection(row.id)}><Icon size={21} /><span>{row.label}</span></button>; })}<button className="danger-link" onClick={() => setSection("account")}><Trash2 size={21} />Hesabı sil</button></aside><main className="settings-content">{section === "account" ? <><header><h2>Hesap</h2><p>Profilinizi ve giriş güvenliğinizi yönetin.</p></header><section className="identity-row"><button className="profile-photo" onClick={() => photoRef.current?.click()}><Avatar name={user.displayName} photoPath={user.photoPath} large /><span><Camera size={16} />Fotoğrafı değiştir</span></button><input ref={photoRef} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); }} /><div><strong>{user.displayName}</strong><span>{user.phone}</span></div></section><section className="form-section"><h3>Profil bilgileri</h3><label>Ad soyad<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Biyografi<textarea value={bio} onChange={(event) => setBio(event.target.value)} /></label><button className="primary-button" onClick={() => onProfile(name, bio)}>Profili kaydet</button></section><section className="form-section"><h3>Parolayı değiştir</h3><label>Mevcut parola<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>Yeni parola<input type="password" minLength={8} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /></label><button className="secondary-button" onClick={() => { onPassword(currentPassword, nextPassword); setCurrentPassword(""); setNextPassword(""); }}>Parolayı güncelle</button></section><section className="danger-card"><h3>Hesabı sil</h3><p>Hesabınız ve kişisel verileriniz kalıcı olarak silinir. Geçmiş mesajlar anonim kalır.</p><input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Onay için parolanız" /><button className="danger-button" onClick={() => { if (window.confirm("Bu işlem geri alınamaz. Hesabınızı silmek istiyor musunuz?")) onDeleteAccount(deletePassword); }}>Hesabı kalıcı olarak sil</button></section></> : null}{section === "privacy" ? <><header><h2>Gizlilik</h2><p>İletişim sinyallerinizin görünürlüğünü yönetin.</p></header><section className="settings-group"><ToggleRow icon={<CheckCheck size={21} />} title="Okundu bilgisi" detail="Kapattığınızda diğer kişilerin okundu bilgilerini de göremezsiniz." checked={settings.readReceipts} onChange={(value) => onSettings({ readReceipts: value })} /><ToggleRow icon={<Clock3 size={21} />} title="Çevrimiçi durum" detail="Kapattığınızda diğer kişilerin çevrimiçi durumunu da göremezsiniz." checked={settings.showOnlineStatus} onChange={(value) => onSettings({ showOnlineStatus: value })} /></section><section className="settings-group"><h3>Engellediğiniz kişiler</h3>{blocked.map((member) => <div className="block-row" key={member.id}><Avatar name={member.displayName} photoPath={member.photoPath} /><span><b>{member.displayName}</b><small>{member.phone}</small></span><button onClick={() => api.unblock(member.id).then(() => setBlocked((current) => current.filter((item) => item.id !== member.id)))}>Engeli kaldır</button></div>)}{!blocked.length ? <p className="muted-copy">Engellenen kişi yok.</p> : null}</section></> : null}{section === "notifications" ? <><header><h2>Bildirimler</h2><p>Uygulama açıkken alınan uyarıları ayarlayın.</p></header><section className="settings-group"><ToggleRow icon={<Bell size={21} />} title="Ekran bildirimleri" detail="Yeni mesajlarda uygulama içi bildirim göster." checked={settings.toastsEnabled} onChange={(value) => onSettings({ toastsEnabled: value })} /><ToggleRow icon={<Volume2 size={21} />} title="Bildirim sesi" detail="Yeni mesaj bildirimi için kısa ses çal." checked={settings.soundEnabled} onChange={(value) => onSettings({ soundEnabled: value })} /><ToggleRow icon={<MessageCircle size={21} />} title="Okunmamış rozetleri" detail="Sohbet listesindeki okunmamış sayaçları göster." checked={settings.badgesEnabled} onChange={(value) => onSettings({ badgesEnabled: value })} /></section></> : null}{section === "appearance" ? <><header><h2>Görünüm</h2><p>Arayüzü çalışma ortamınıza göre ayarlayın.</p></header><section className="settings-group"><h3>Tema</h3><div className="theme-options">{(["system", "light", "dark"] as Theme[]).map((theme) => <button key={theme} className={settings.theme === theme ? "selected" : ""} onClick={() => onSettings({ theme })}>{theme === "system" ? <Settings size={20} /> : theme === "light" ? <Sun size={20} /> : <Moon size={20} />}<span>{theme === "system" ? "Sistem" : theme === "light" ? "Açık" : "Koyu"}</span></button>)}</div><ToggleRow icon={<Clock3 size={21} />} title="Hareketi azalt" detail="Animasyonları daha sakin ve kısa tut." checked={settings.reduceMotion} onChange={(value) => onSettings({ reduceMotion: value })} /></section></> : null}{section === "storage" ? <><header><h2>Veri ve depolama</h2><p>Paylaşılan dosyalar sohbet erişim kurallarına göre korunur.</p></header><section className="settings-group"><div className="storage-copy"><Database size={24} /><div><h3>Medya ve belgeler</h3><p>Dosyalar sohbet içinden veya sohbet ayarlarından görüntülenebilir.</p></div></div></section></> : null}</main></section>;
}

function ToggleRow({ icon, title, detail, checked, onChange }: { icon: ReactNode; title: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span className="toggle-icon">{icon}</span><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null); const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS); const [conversations, setConversations] = useState<Conversation[]>([]); const [archived, setArchived] = useState<Conversation[]>([]); const [invites, setInvites] = useState<Invitation[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]); const [hasMore, setHasMore] = useState(false); const [cursor, setCursor] = useState<string | null>(null); const [activeNav, setActiveNav] = useState<Nav>("all"); const [createOpen, setCreateOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [senateOpen, setSenateOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [status, setStatus] = useState(""); const socketRef = useRef<Socket | null>(null); const selectedRef = useRef<string | null>(null);
  const messageRequestRef = useRef<AbortController | null>(null);
  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? archived.find((conversation) => conversation.id === selectedId) ?? null, [archived, conversations, selectedId]);
  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setArchived((current) => current.filter((item) => item.id !== conversation.id));
  }, []);
  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => { try { await action(); if (success) setStatus(success); return true; } catch (error) { setStatus(error instanceof Error ? error.message : "İşlem gerçekleştirilemedi."); return false; } }, []);
  const loadConversations = useCallback(async () => { const [active, archivedPayload] = await Promise.all([api.conversations(), api.conversations(true)]); setConversations(active.conversations); setArchived(archivedPayload.conversations); setSelectedId((current) => current ?? active.conversations[0]?.id ?? null); }, []);
  const loadMessages = useCallback(async (conversationId: string, retried = false): Promise<void> => {
    messageRequestRef.current?.abort();
    const controller = new AbortController();
    messageRequestRef.current = controller;
    try {
      const payload = await api.messages(conversationId, null, controller.signal);
      if (selectedRef.current !== conversationId || controller.signal.aborted) return;
      setMessages(payload.messages); setHasMore(payload.hasMore); setCursor(payload.nextCursor);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (error instanceof ApiError && error.status === 403) {
        if (selectedRef.current === conversationId) {
          selectedRef.current = null; setSelectedId(null); setMessages([]); setCursor(null); setHasMore(false);
          await loadConversations();
        }
        setStatus("Bu sohbete erişiminiz kaldırıldı.");
        return;
      }
      if (error instanceof ApiError && error.retryable && !retried) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
        if (selectedRef.current === conversationId) await loadMessages(conversationId, true);
        return;
      }
      if (selectedRef.current === conversationId) setStatus(error instanceof Error ? error.message : "Mesajlar yüklenemedi.");
    }
  }, [loadConversations]);
  useEffect(() => { if (user) return; api.me().then(({ user: nextUser }) => setUser(nextUser)).catch(() => undefined); }, [user]);
  useEffect(() => {
    if (!user) return;
    Promise.all([api.settings(), loadConversations(), api.invites()])
      .then(([settingsPayload, , invitePayload]) => { setSettings(settingsPayload.settings); setInvites(invitePayload.invites); })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Uygulama verileri yüklenemedi."));
  }, [loadConversations, user?.id]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { if (!status) return; const id = window.setTimeout(() => setStatus(""), 4500); return () => window.clearTimeout(id); }, [status]);
  useEffect(() => { const root = document.documentElement; root.dataset.theme = settings.theme; root.dataset.reduceMotion = String(settings.reduceMotion); }, [settings.reduceMotion, settings.theme]);
  useEffect(() => { if (!user) return; const socket = io("/", { withCredentials: true }); socketRef.current = socket; socket.on("conversation:updated", (conversation: Conversation) => { if (conversation.archivedAt) { setArchived((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]); setConversations((current) => current.filter((item) => item.id !== conversation.id)); } else upsertConversation(conversation); }); socket.on("senate:invite", (invite: Invitation) => setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)])); const updateMessage = (message: Message) => { if (message.conversationId === selectedRef.current) setMessages((current) => current.some((item) => item.id === message.id) ? current.map((item) => item.id === message.id ? message : item) : [...current, message]); }; socket.on("message:new", (message: Message) => { updateMessage(message); if (message.senderId !== user.id && settings.toastsEnabled) { setStatus(`Yeni mesaj: ${message.senderName}`); if (settings.soundEnabled) new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play().catch(() => undefined); } }); socket.on("message:edited", updateMessage); socket.on("message:deleted", updateMessage); socket.on("message:read", updateMessage); socket.on("message:reaction", updateMessage); return () => { socket.close(); socketRef.current = null; }; }, [settings.soundEnabled, settings.toastsEnabled, upsertConversation, user]);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const removeConversation = ({ conversationId }: { conversationId: string }) => {
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      setArchived((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (selectedRef.current === conversationId) {
        selectedRef.current = null; setSelectedId(null); setMessages([]); setCursor(null); setHasMore(false);
        setSettingsOpen(false); setSenateOpen(false); setSearchOpen(false);
      }
    };
    socket.on("conversation:removed", removeConversation);
    return () => { socket.off("conversation:removed", removeConversation); };
  }, [settings.soundEnabled, settings.toastsEnabled, user]);
  useEffect(() => { if (!selectedId || !user) return; setMessages([]); setCursor(null); setHasMore(false); socketRef.current?.emit("conversation:join", selectedId); void loadMessages(selectedId); return () => { messageRequestRef.current?.abort(); socketRef.current?.emit("conversation:leave", selectedId); }; }, [loadMessages, selectedId, user]);
  useLayoutEffect(() => {
    if (!selectedId || !messages.some((message) => message.conversationId !== selectedId)) return;
    setMessages((current) => current.filter((message) => message.conversationId === selectedId));
    setCursor(null); setHasMore(false);
  }, [messages, selectedId]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setCreateOpen(false); setSettingsOpen(false); setSenateOpen(false); setSearchOpen(false); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  if (!user) return <AuthScreen onAuth={setUser} />;
  const visibleConversations = activeNav === "archived" ? archived : conversations;
  const unreadCount = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const navigate = (next: Nav) => { setActiveNav(next); if (next !== "all" && next !== "private" && next !== "senates" && next !== "archived" || window.innerWidth <= 760) setSelectedId(null); };
  return <div className="app-shell"><AppSidebar active={activeNav} user={user} inviteCount={invites.length} unreadCount={settings.badgesEnabled ? unreadCount : 0} onNavigate={navigate} onLogout={() => void run(async () => { await api.logout(); setUser(null); }, "Oturum kapatıldı.")} />{activeNav === "settings" ? <SettingsView user={user} settings={settings} onSettings={(input) => void run(async () => { const payload = await api.updateSettings(input); setSettings(payload.settings); }, "Ayarlar kaydedildi.")} onProfile={(displayName, bio) => void run(async () => { const payload = await api.updateProfile({ displayName, bio }); setUser(payload.user); }, "Profil güncellendi.")} onPhoto={(file) => void run(async () => { const payload = await api.uploadPhoto(file); setUser((current) => current ? { ...current, photoPath: payload.photoPath } : current); }, "Profil fotoğrafı güncellendi.")} onPassword={(current, next) => void run(() => api.changePassword({ currentPassword: current, newPassword: next }), "Parola güncellendi.")} onDeleteAccount={(password) => void run(async () => { await api.deleteAccount(password); setUser(null); }, "Hesap silindi.")} /> : activeNav === "invites" ? <InvitesPanel invites={invites} onRespond={(id, action) => void run(async () => { const result = await api.respondToInvite(id, action); setInvites((current) => current.filter((invite) => invite.id !== id)); if (result.conversation) { upsertConversation(result.conversation); setSelectedId(result.conversation.id); setActiveNav("all"); } }, action === "accept" ? "Senatoya katıldınız." : "Davet güncellendi.")} /> : activeNav === "admin" && user.adminAccess ? <section className="full-page-panel"><header className="page-header"><div><h1>Yönetim</h1><p>Yerel yedekleme işlemleri</p></div></header><button className="primary-button" onClick={() => void run(async () => { const payload = await api.backup(); setStatus(`Yedek oluşturuldu: ${payload.path}`); })}>Yerel yedek oluştur</button></section> : <><ConversationList conversations={visibleConversations} selectedId={selectedId} active={activeNav} onSelect={setSelectedId} onCreate={() => setCreateOpen(true)} /><ChatPanel user={user} conversation={selected} messages={messages} hasMore={hasMore} onLoadOlder={async () => { if (!selectedId || !cursor) return; const payload = await api.messages(selectedId, cursor); setMessages((current) => [...payload.messages, ...current]); setCursor(payload.nextCursor); setHasMore(payload.hasMore); }} onUpload={async (file) => { if (!selectedId) throw new Error("Önce bir sohbet seçin."); return (await api.uploadAttachment(selectedId, file)).attachment; }} onSend={(body, attachmentIds, replyId) => selectedId ? run(async () => { await api.sendMessage(selectedId, body, attachmentIds, replyId); }) : Promise.resolve(false)} onEdit={(id, body) => void run(async () => { await api.editMessage(id, body); })} onDelete={(id) => void run(async () => { await api.deleteMessage(id); })} onReact={(id, emoji) => void run(async () => { await api.react(id, emoji); })} onUnreact={(id, emoji) => void run(async () => { await api.unreact(id, emoji); })} onOpenSettings={() => setSettingsOpen(true)} onOpenSenate={() => setSenateOpen(true)} onSearch={() => setSearchOpen(true)} onMarkRead={(id) => { void api.markRead(id).catch(() => undefined); }} /><NewConversationDrawer open={createOpen} onClose={() => setCreateOpen(false)} onSearch={async (query) => (await api.members(query)).members} onCreateDm={(id) => void run(async () => { const { conversation } = await api.createDm(id); upsertConversation(conversation); setSelectedId(conversation.id); setCreateOpen(false); })} onCreateSenate={(input) => void run(async () => { const { conversation } = await api.createSenate(input); upsertConversation(conversation); setSelectedId(conversation.id); setCreateOpen(false); }, "Senato oluşturuldu.")} /><ConversationSettingsDrawer open={settingsOpen} conversation={selected} onClose={() => setSettingsOpen(false)} onUpdate={(input) => selected && void run(async () => { const { conversation } = await api.updateConversationPreferences(selected.id, input); if (conversation.archivedAt) { setArchived((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]); setConversations((current) => current.filter((item) => item.id !== conversation.id)); if (input.clear) setMessages([]); } else upsertConversation(conversation); }, "Sohbet ayarları güncellendi.")} onBlock={(id) => void run(async () => { await api.block(id); setSettingsOpen(false); setSelectedId(null); setMessages([]); }, "Üye engellendi.")} onSearch={() => { setSettingsOpen(false); setSearchOpen(true); }} /><SenateDrawer open={senateOpen} conversation={selected} user={user} onClose={() => setSenateOpen(false)} onSave={(name, description) => selected?.senateId && void run(async () => { const { conversation } = await api.updateSenate(selected.senateId!, { name, description }); upsertConversation(conversation); }, "Senato güncellendi.")} onInvite={(id) => selected?.senateId && void run(async () => { await api.inviteToSenate(selected.senateId!, id); }, "Davet gönderildi.")} onPermission={(id, canInvite) => selected?.senateId && void run(async () => { const { conversation } = await api.setInvitePermission(selected.senateId!, id, canInvite); upsertConversation(conversation); })} onRemove={(id) => selected?.senateId && void run(async () => { await api.removeSenateMember(selected.senateId!, id); })} onLeave={() => selected?.senateId && void run(async () => { await api.leaveSenate(selected.senateId!); setSenateOpen(false); setSelectedId(null); await loadConversations(); }, "Senatodan ayrıldınız.")} onTransfer={(id) => selected?.senateId && void run(async () => { const { conversation } = await api.transferSenateOwnership(selected.senateId!, id); upsertConversation(conversation); }, "Kuruculuk devredildi.")} onDelete={() => selected?.senateId && void run(async () => { await api.deleteSenate(selected.senateId!); setSenateOpen(false); setSelectedId(null); await loadConversations(); }, "Senato silindi.")} /><SearchDrawer open={searchOpen} conversation={selected} onClose={() => setSearchOpen(false)} onSearch={async (query) => selected ? (await api.searchMessages(selected.id, { query })).messages : []} /></>}{status ? <div className="toast" role="status"><Bell size={17} /><span>{status}</span><button aria-label="Bildirimi kapat" onClick={() => setStatus("")}><X size={15} /></button></div> : null}</div>;
}
