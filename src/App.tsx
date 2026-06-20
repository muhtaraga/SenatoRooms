import {
  Archive,
  Bell,
  Camera,
  Check,
  CheckCheck,
  Download,
  FileText,
  FileUp,
  Film,
  LayoutList,
  LogOut,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Video,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";
import type { Attachment, Conversation, Invitation, Member, Message, User } from "./types";

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Avatar({ name, photoPath, senate = false, large = false }: { name: string; photoPath?: string | null; senate?: boolean; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "avatar-large" : ""}`}>
      {photoPath ? <img src={photoPath} alt="" /> : senate ? <Users size={large ? 30 : 18} /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const payload = mode === "login" ? await api.login({ phone, password }) : await api.register({ phone, password, displayName });
      onAuth(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giris basarisiz.");
    }
  }

  return <main className="auth-shell"><section className="auth-panel"><div className="brand-lockup"><div className="brand-mark">SR</div><div><h1>SenatoRoom</h1><p>Senato uyeleri icin guvenli haberlesme alani</p></div></div><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Giris</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Kayit</button></div><form onSubmit={submit} className="auth-form">{mode === "register" ? <label>Ad Soyad<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required /></label> : null}<label>Telefon<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" placeholder="5533772732" required /><small className="input-hint">10 haneli numaranizi 5533772732 formatinda girin.</small></label><label>Sifre<input type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action" type="submit">{mode === "login" ? "Oturum ac" : "Senato uyesi ol"}</button></form></section></main>;
}

function Sidebar({ active, inviteCount, onActive, onLogout, user }: { active: string; inviteCount: number; onActive: (active: string) => void; onLogout: () => void; user: User }) {
  const items = [
    { id: "all", label: "Tumu", icon: LayoutList },
    { id: "private", label: "Ozel", icon: MessageCircle },
    { id: "senates", label: "Senatolar", icon: Users },
    { id: "invites", label: "Davetler", icon: UserPlus },
    { id: "profile", label: "Profil", icon: Shield },
    ...(user.adminAccess ? [{ id: "admin", label: "Admin", icon: Archive }] : [])
  ];
  return <aside className="sidebar"><div className="brand"><div className="brand-mark">SR</div><strong>SenatoRoom</strong></div><nav>{items.map((item) => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? "selected" : ""} onClick={() => onActive(item.id)}><span className="sidebar-nav-icon"><Icon size={18} />{item.id === "invites" && inviteCount ? <span className="sidebar-badge" aria-label={`${inviteCount} bekleyen davet`}>{inviteCount > 99 ? "99+" : inviteCount}</span> : null}</span>{item.label}</button>; })}</nav><div className="sidebar-footer"><Avatar name={user.displayName} photoPath={user.photoPath} /><button title="Cikis" onClick={onLogout}><LogOut size={18} /></button></div></aside>;
}

function ConversationList({ conversations, selectedId, filter, onSelect, onOpenCreate }: { conversations: Conversation[]; selectedId: string | null; filter: string; onSelect: (id: string) => void; onOpenCreate: () => void }) {
  const [query, setQuery] = useState("");
  const visible = conversations.filter((conversation) => (filter === "private" ? conversation.type === "dm" : filter === "senates" ? conversation.type === "senate" : true) && conversation.title.toLowerCase().includes(query.toLowerCase()));
  const heading = filter === "senates" ? "Senatolar" : filter === "private" ? "Ozel sohbetler" : "Tum sohbetler";
  return <section className="conversation-list"><div className="section-head"><div><h2>{heading}</h2><span>{visible.length} aktif kanal</span></div><button className="icon-button" title="Yeni sohbet veya senato" onClick={onOpenCreate}><Plus size={18} /></button></div><label className="search-box"><Search size={17} /><input placeholder="Uye veya senato ara" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="thread-list">{visible.map((conversation) => <button key={conversation.id} className={`thread-item ${conversation.id === selectedId ? "selected" : ""}`} onClick={() => onSelect(conversation.id)}><Avatar name={conversation.title} photoPath={conversation.photoPath} senate={conversation.type === "senate"} /><span className="thread-copy"><strong>{conversation.title}</strong><small>{conversation.latestMessage?.body || "Henuz mesaj yok"}</small></span><time>{formatTime(conversation.latestMessage?.createdAt)}</time></button>)}</div></section>;
}

function useMemberSearch(onSearch: (query: string) => Promise<Member[]>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let active = true;
    onSearch(term).then((members) => active && setResults(members)).catch(() => active && setResults([]));
    return () => { active = false; };
  }, [onSearch, query]);

  return { query, setQuery, results };
}

function MemberSearchResults({ members, selectedIds, onToggle, onChoose }: { members: Member[]; selectedIds?: string[]; onToggle?: (id: string) => void; onChoose?: (id: string) => void }) {
  if (!members.length) return null;
  return <div className="member-search-results">{members.map((member) => <div key={member.id} className="member-choice"><Avatar name={member.displayName} photoPath={member.photoPath} /><span><strong>{member.displayName}</strong><small>{member.phone}</small></span>{onToggle ? <input type="checkbox" checked={selectedIds?.includes(member.id)} onChange={() => onToggle(member.id)} /> : <button className="secondary-action" onClick={() => onChoose?.(member.id)}>Sec</button>}</div>)}</div>;
}

function CreatePanel({ open, onSearch, onClose, onCreateDm, onCreateSenate }: { open: boolean; onSearch: (query: string) => Promise<Member[]>; onClose: () => void; onCreateDm: (memberId: string) => Promise<boolean>; onCreateSenate: (input: { name: string; description: string; memberIds: string[]; photo?: File }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | undefined>();
  const photoRef = useRef<HTMLInputElement | null>(null);
  const privateSearch = useMemberSearch(onSearch);
  const senateSearch = useMemberSearch(onSearch);
  if (!open) return null;
  const toggleMember = (id: string) => setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <div className="create-backdrop" role="presentation" onClick={onClose}><aside className="create-panel" aria-label="Yeni sohbet veya senato" onClick={(event) => event.stopPropagation()}><div className="section-head"><div><h2>Yeni islem</h2><span>Ozel sohbet baslatin veya senato kurun</span></div><button className="icon-button" title="Kapat" onClick={onClose}><X size={18} /></button></div><div className="create-section"><div className="create-title"><MessageCircle size={18} /><h3>Ozel sohbet</h3></div><label className="member-search"><Search size={16} /><input aria-label="Ozel sohbet uyesi ara" placeholder="Isim veya telefon ara" value={privateSearch.query} onChange={(event) => privateSearch.setQuery(event.target.value)} /></label><MemberSearchResults members={privateSearch.results} onChoose={async (memberId) => { if (await onCreateDm(memberId)) { privateSearch.setQuery(""); onClose(); } }} /></div><div className="create-section"><div className="create-title"><Users size={18} /><h3>Senato kur</h3></div><input placeholder="Senato adi" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /><textarea placeholder="Senato aciklamasi (istege bagli)" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /><input ref={photoRef} hidden type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0])} /><button className="photo-picker" onClick={() => photoRef.current?.click()}>{photo ? photo.name : "Grup fotografi sec"}</button><div className="member-picker"><strong>Ilk uyeler</strong><label className="member-search"><Search size={16} /><input aria-label="Senato uyesi ara" placeholder="Isim veya telefon ara" value={senateSearch.query} onChange={(event) => senateSearch.setQuery(event.target.value)} /></label><MemberSearchResults members={senateSearch.results} selectedIds={memberIds} onToggle={toggleMember} />{memberIds.length ? <small>{memberIds.length} uye secildi</small> : null}</div><button className="primary-action" disabled={!name.trim()} onClick={async () => { if (name.trim() && await onCreateSenate({ name, description, memberIds, photo })) { setName(""); setDescription(""); setMemberIds([]); setPhoto(undefined); onClose(); } }}>Senatoyu olustur</button></div></aside></div>;
}

function AttachmentView({ attachment, onPlay }: { attachment: Attachment; onPlay: (url: string, name: string) => void }) {
  if (attachment.mimeType.startsWith("image/") && attachment.previewUrl) return <a className="media-preview image-preview" href={attachment.previewUrl} target="_blank" rel="noreferrer"><img src={attachment.previewUrl} alt={attachment.originalName} /></a>;
  if (attachment.mimeType.startsWith("video/") && attachment.previewUrl) return <button className="media-preview video-preview" onClick={() => onPlay(attachment.previewUrl!, attachment.originalName)}><video src={attachment.previewUrl} muted preload="metadata" /><span><Film size={18} />Videoyu oynat</span></button>;
  return <a className="attachment" href={attachment.url} target="_blank" rel="noreferrer"><Download size={15} />{attachment.originalName}<span>{fileSize(attachment.size)}</span></a>;
}

function ChatPanel({ user, conversation, messages, hasMore, isLoadingOlder, onLoadOlder, onSend, onEdit, onDelete, onUpload, typing, onTyping, onOpenSenate, onOpenMember }: { user: User; conversation: Conversation | null; messages: Message[]; hasMore: boolean; isLoadingOlder: boolean; onLoadOlder: () => Promise<void>; onSend: (body: string, attachmentIds: string[]) => Promise<boolean>; onEdit: (id: string, body: string) => void; onDelete: (id: string) => void; onUpload: (file: File) => Promise<Attachment>; typing: string; onTyping: (active: boolean) => void; onOpenSenate: () => void; onOpenMember: (id: string) => void }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [accept, setAccept] = useState("*/*");
  const [uploadError, setUploadError] = useState("");
  const previousMessageCount = useRef(0);
  const atBottom = useRef(true);
  const peer = conversation?.type === "dm" ? conversation.members.find((member) => member.id !== user.id) : null;
  useEffect(() => {
    if (!peer) return;
    const handleHeadingClick = (event: MouseEvent) => {
      if ((event.target as Element).closest(".conversation-heading")) onOpenMember(peer.id);
    };
    document.addEventListener("click", handleHeadingClick);
    return () => document.removeEventListener("click", handleHeadingClick);
  }, [onOpenMember, peer]);
  useEffect(() => {
    const stream = document.querySelector<HTMLElement>(".message-stream");
    if (!stream || !conversation) return;
    const scrollToBottom = () => { stream.scrollTop = stream.scrollHeight; };
    if (previousMessageCount.current === 0 || atBottom.current) requestAnimationFrame(scrollToBottom);
    previousMessageCount.current = messages.length;
    const onScroll = async () => {
      atBottom.current = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
      if (stream.scrollTop > 80 || !hasMore || isLoadingOlder) return;
      const previousHeight = stream.scrollHeight;
      await onLoadOlder();
      requestAnimationFrame(() => { stream.scrollTop += stream.scrollHeight - previousHeight; });
    };
    stream.addEventListener("scroll", onScroll, { passive: true });
    return () => stream.removeEventListener("scroll", onScroll);
  }, [conversation?.id, hasMore, isLoadingOlder, messages.length, onLoadOlder]);
  if (!conversation) return <section className="chat-panel empty-state"><MessageCircle size={42} /><h2>Bir sohbet secin</h2><p>Ozel uyelerle veya davetli senatolarla konusmaya baslayin.</p></section>;
  async function uploadFile(file?: File) { if (file) { try { setUploadError(""); const attachment = await onUpload(file); setPending((current) => [...current, attachment]); } catch (error) { setUploadError(error instanceof Error ? error.message : "Dosya yuklenemedi."); } } }
  function chooseFile(nextAccept: string) { setAccept(nextAccept); setFileMenuOpen(false); window.setTimeout(() => fileRef.current?.click(), 0); }
  async function send() { if (!body.trim() && pending.length === 0) return; if (await onSend(body, pending.map((item) => item.id))) { setBody(""); setPending([]); onTyping(false); } }
  return <section className="chat-panel"><header className="chat-header"><div className="conversation-heading"><Avatar name={conversation.title} photoPath={conversation.photoPath} senate={conversation.type === "senate"} /><div><h2>{conversation.title}</h2><span>{conversation.type === "senate" ? `${conversation.members.length} uye` : "Ozel konusma"}</span></div></div><div className="chat-actions"><button title="Sesli arama yakinda" disabled><Phone size={18} /></button><button title="Goruntulu arama yakinda" disabled><Video size={18} /></button><button title="Sesli mesaj yakinda" disabled><Mic size={18} /></button><button title={conversation.type === "senate" ? "Senato bilgileri" : "Daha fazla"} onClick={conversation.type === "senate" ? onOpenSenate : undefined} disabled={conversation.type !== "senate"}><MoreHorizontal size={18} /></button></div></header><div className="message-stream">{messages.map((message) => { const mine = message.senderId === user.id; const isEditing = editing?.id === message.id; const othersRead = Math.max(0, message.readCount - 1); return <article key={message.id} className={`message ${mine ? "mine" : ""}`}><div className="message-meta"><strong>{mine ? "Siz" : message.senderName}</strong><span>{formatTime(message.createdAt)}</span></div><div className="message-row"><div className="message-bubble">{message.deletedAt ? <em>Bu mesaj silindi.</em> : isEditing ? <div className="inline-editor"><textarea value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} /><div><button onClick={() => { if (editing.body.trim()) { onEdit(message.id, editing.body); setEditing(null); } }}>Kaydet</button><button onClick={() => setEditing(null)}>Iptal</button></div></div> : <p>{message.body}</p>}{message.attachments.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} onPlay={(url, name) => setVideo({ url, name })} />)}<div className="message-tools">{mine ? <span title={conversation.type === "dm" ? "Okundu" : "Okuyan uye sayisi"}>{othersRead > 0 ? <CheckCheck size={14} /> : <Check size={14} />}{conversation.type === "senate" && othersRead > 0 ? othersRead : null}</span> : null}{message.editedAt ? <span>duzenlendi</span> : null}</div></div>{mine && !message.deletedAt && !isEditing ? <div className="message-menu-wrap"><button className="message-more" aria-label="Mesaj islemleri" onClick={() => setMenuId(menuId === message.id ? null : message.id)}><MoreHorizontal size={16} /></button>{menuId === message.id ? <div className="message-menu"><button onClick={() => { setEditing({ id: message.id, body: message.body }); setMenuId(null); }}>Duzenle</button><button className="danger" onClick={() => { onDelete(message.id); setMenuId(null); }}>Sil</button></div> : null}</div> : null}</div></article>; })}{typing ? <div className="typing">{typing} yaziyor...</div> : null}</div>{pending.length ? <div className="pending-files">{pending.map((item) => <span key={item.id}>{item.originalName}</span>)}</div> : null}{uploadError ? <p className="form-error composer-error">{uploadError}</p> : null}<footer className="composer"><input ref={fileRef} type="file" hidden accept={accept} onChange={(event) => { uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /><div className="file-menu-wrap"><button title="Dosya ekle" onClick={() => setFileMenuOpen((current) => !current)}><FileUp size={19} /></button>{fileMenuOpen ? <div className="file-menu"><button onClick={() => chooseFile("image/*")}><Camera size={16} />Gorsel</button><button onClick={() => chooseFile("video/*")}><Film size={16} />Video</button><button onClick={() => chooseFile(".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv")}><FileText size={16} />Belge</button><button onClick={() => chooseFile("*/*")}><Paperclip size={16} />Diger</button></div> : null}</div><textarea placeholder="Mesaj yazin" value={body} onChange={(event) => { setBody(event.target.value); onTyping(Boolean(event.target.value)); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="send-button" onClick={() => void send()}><Send size={19} /></button></footer>{video ? <div className="media-modal" role="dialog" aria-modal="true" aria-label={video.name} onClick={() => setVideo(null)}><div onClick={(event) => event.stopPropagation()}><div className="section-head"><strong>{video.name}</strong><button className="icon-button" onClick={() => setVideo(null)}><X size={18} /></button></div><video src={video.url} controls autoPlay /></div></div> : null}</section>;
}

function ProfilePanel({ user, onProfileSave, onPhoto }: { user: User; onProfileSave: (displayName: string, bio: string) => void; onPhoto: (file: File) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const photoRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setDisplayName(user.displayName); setBio(user.bio); }, [user]);
  return <aside className="profile-panel"><div className="profile-card"><button className="photo" onClick={() => photoRef.current?.click()}>{user.photoPath ? <img src={user.photoPath} alt="" /> : <Camera size={26} />}</button><input ref={photoRef} hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onPhoto(event.target.files[0])} /><h3>{user.displayName}</h3><span>{user.phone}</span></div><div className="profile-form"><label>Ad Soyad<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Biyografi<textarea value={bio} onChange={(event) => setBio(event.target.value)} /></label><button className="secondary-action" onClick={() => onProfileSave(displayName, bio)}>Profili kaydet</button></div></aside>;
}

function MemberProfileModal({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!memberId) return;
    setMember(null);
    setError("");
    api.member(memberId).then(({ member: nextMember }) => setMember(nextMember)).catch((err) => setError(err instanceof Error ? err.message : "Profil yuklenemedi."));
  }, [memberId]);

  if (!memberId) return null;
  return <div className="profile-modal-backdrop" role="presentation" onClick={onClose}><section className="member-profile-modal" role="dialog" aria-modal="true" aria-label="Uye profili" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" title="Kapat" onClick={onClose}><X size={18} /></button>{member ? <><Avatar name={member.displayName} photoPath={member.photoPath} large /><h2>{member.displayName}</h2><span>{member.phone}</span><p>{member.bio || "Biyografi eklenmemis."}</p></> : <p>{error || "Profil yukleniyor..."}</p>}</section></div>;
}

function SenatePanel({ open, conversation, user, onSearch, onClose, onSave, onInvite, onPermission, onOpenMember }: { open: boolean; conversation: Conversation | null; user: User; onSearch: (query: string) => Promise<Member[]>; onClose: () => void; onSave: (input: { name: string; description: string; photo?: File }) => void; onInvite: (memberId: string) => void; onPermission: (memberId: string, canInvite: boolean) => void; onOpenMember: (id: string) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [photo, setPhoto] = useState<File | undefined>(); const photoRef = useRef<HTMLInputElement | null>(null);
  const memberSearch = useMemberSearch(onSearch);
  useEffect(() => { setName(conversation?.title ?? ""); setDescription(conversation?.description ?? ""); setPhoto(undefined); }, [conversation]);
  useEffect(() => {
    if (!open || !conversation || conversation.type !== "senate") return;
    const handleMemberClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".permission-toggle")) return;
      const row = target.closest(".senate-panel .member-picker > .member-choice");
      if (!row) return;
      const rows = [...document.querySelectorAll(".senate-panel .member-picker > .member-choice")];
      const index = rows.indexOf(row);
      if (index >= 0) onOpenMember(conversation.members[index].id);
    };
    document.addEventListener("click", handleMemberClick);
    return () => document.removeEventListener("click", handleMemberClick);
  }, [conversation, onOpenMember, open]);
  if (!open || !conversation || conversation.type !== "senate") return null;
  const candidates = memberSearch.results.filter((member) => !conversation.members.some((item) => item.id === member.id));
  return <div className="create-backdrop" role="presentation" onClick={onClose}><aside className="create-panel senate-panel" aria-label="Senato bilgileri" onClick={(event) => event.stopPropagation()}><div className="section-head"><div><h2>Senato bilgileri</h2><span>{conversation.members.length} uye</span></div><button className="icon-button" title="Kapat" onClick={onClose}><X size={18} /></button></div><div className="senate-identity"><Avatar name={conversation.title} photoPath={conversation.photoPath} senate large /><div><strong>{conversation.title}</strong><span>{conversation.description || "Aciklama eklenmemis."}</span></div></div>{conversation.canEdit ? <div className="create-section"><h3>Grup bilgileri</h3><input value={name} onChange={(event) => setName(event.target.value)} /><textarea value={description} onChange={(event) => setDescription(event.target.value)} /><input ref={photoRef} hidden type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0])} /><button className="photo-picker" onClick={() => photoRef.current?.click()}>{photo ? photo.name : "Grup fotografi degistir"}</button><button className="primary-action" disabled={!name.trim()} onClick={() => onSave({ name, description, photo })}>Bilgileri kaydet</button></div> : null}{conversation.canInvite ? <div className="create-section"><h3>Uye davet et</h3><label className="member-search"><Search size={16} /><input aria-label="Davet edilecek uye ara" placeholder="Isim veya telefon ara" value={memberSearch.query} onChange={(event) => memberSearch.setQuery(event.target.value)} /></label><MemberSearchResults members={candidates} onChoose={(memberId) => { onInvite(memberId); memberSearch.setQuery(""); }} /></div> : null}<div className="member-picker"><strong>Uyeler</strong>{conversation.members.map((member) => <div key={member.id} className="member-choice"><Avatar name={member.displayName} photoPath={member.photoPath} /><span>{member.displayName}{member.id === conversation.createdById ? " (Kurucu)" : ""}</span>{conversation.canEdit && member.id !== user.id ? <label className="permission-toggle"><input type="checkbox" checked={member.canInvite} onChange={(event) => onPermission(member.id, event.target.checked)} />Davet</label> : null}</div>)}</div></aside></div>;
}

function AdminPanel({ onBackup }: { onBackup: () => void }) { return <section className="admin-panel"><div><Archive size={28} /><h2>Admin</h2><p>Yerel bilgisayardaki veritabani ve yuklemeler icin manuel yedekleme.</p></div><button className="primary-action" onClick={onBackup}><Archive size={17} />Local yedek al</button></section>; }

function InvitesPanel({ invites, onRespond }: { invites: Invitation[]; onRespond: (id: string, action: "accept" | "decline" | "block") => Promise<boolean> }) {
  return <section className="invite-panel"><div className="section-head"><div><h2>Davetler</h2><span>{invites.length ? `${invites.length} bekleyen davet` : "Bekleyen davet yok"}</span></div></div>{invites.length ? <div className="invite-list">{invites.map((invite) => <article key={invite.id} className="invite-card"><div className="invite-identity"><Avatar name={invite.name} photoPath={invite.photoPath} senate /><div><strong>{invite.name}</strong><span>{invite.invitedByName} sizi davet etti · {invite.memberCount} uye</span></div></div>{invite.description ? <p>{invite.description}</p> : null}<div className="invite-actions"><button className="primary-action" onClick={() => void onRespond(invite.id, "accept")}>Kabul et</button><button className="secondary-action" onClick={() => void onRespond(invite.id, "decline")}>Reddet</button><button className="danger-action" onClick={() => void onRespond(invite.id, "block")}>Engelle</button></div></article>)}</div> : <div className="invite-empty"><UserPlus size={32} /><h2>Bekleyen davet yok</h2><p>Yeni bir senato daveti geldiğinde burada gorunecek.</p></div>}</section>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null); const [conversations, setConversations] = useState<Conversation[]>([]); const [invites, setInvites] = useState<Invitation[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]); const [hasMoreMessages, setHasMoreMessages] = useState(false); const [nextMessageCursor, setNextMessageCursor] = useState<string | null>(null); const [isLoadingOlder, setIsLoadingOlder] = useState(false); const [activeNav, setActiveNav] = useState("all"); const [createPanelOpen, setCreatePanelOpen] = useState(false); const [senatePanelOpen, setSenatePanelOpen] = useState(false); const [profileMemberId, setProfileMemberId] = useState<string | null>(null); const [status, setStatus] = useState(""); const [typing, setTyping] = useState(""); const socketRef = useRef<Socket | null>(null); const selectedIdRef = useRef<string | null>(null);
  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);
  const loadBase = useCallback(async () => { try { const conversationPayload = await api.conversations(); setConversations(conversationPayload.conversations); setSelectedId((current) => current ?? conversationPayload.conversations[0]?.id ?? null); } catch (error) { setStatus(error instanceof Error ? error.message : "Sohbetler yuklenemedi."); } }, []);
  const loadInvites = useCallback(async () => { try { const payload = await api.invites(); setInvites(payload.invites); } catch (error) { setStatus(error instanceof Error ? error.message : "Davetler yuklenemedi."); } }, []);
  const searchMembers = useCallback(async (query: string) => (await api.members(query)).members, []);
  useEffect(() => { api.me().then(({ user: nextUser }) => setUser(nextUser)).catch(() => undefined); }, []);
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(""), 5000); return () => window.clearTimeout(timer); }, [status]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { if (!user) return; void Promise.all([loadBase(), loadInvites()]); const socket = io("/", { withCredentials: true }); socketRef.current = socket; socket.on("conversation:updated", (conversation: Conversation) => setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])); socket.on("senate:invite", (invite: Invitation) => { setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]); setStatus(`${invite.name} senatosuna davet edildiniz.`); }); socket.on("message:new", (message: Message) => { if (message.conversationId !== selectedIdRef.current) return; setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); if (message.senderId !== user.id) { setStatus("Yeni mesaj alindi."); new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play().catch(() => undefined); } }); socket.on("message:edited", (message: Message) => { if (message.conversationId === selectedIdRef.current) setMessages((current) => current.map((item) => item.id === message.id ? message : item)); }); socket.on("message:deleted", (message: Message) => { if (message.conversationId === selectedIdRef.current) setMessages((current) => current.map((item) => item.id === message.id ? message : item)); }); socket.on("message:read", (message: Message) => { if (message.conversationId === selectedIdRef.current) setMessages((current) => current.map((item) => item.id === message.id ? message : item)); }); socket.on("typing:start", ({ conversationId, userId }: { conversationId: string; userId: string }) => { if (conversationId === selectedIdRef.current && userId !== user.id) setTyping("Bir uye"); }); socket.on("typing:stop", ({ conversationId }: { conversationId: string }) => { if (conversationId === selectedIdRef.current) setTyping(""); }); return () => { socket.close(); socketRef.current = null; }; }, [loadBase, loadInvites, user]);
  useEffect(() => { if (!selectedId || !socketRef.current) return; let active = true; socketRef.current.emit("conversation:join", selectedId); setMessages([]); setHasMoreMessages(false); setNextMessageCursor(null); api.messages(selectedId).then(({ messages: nextMessages, hasMore, nextCursor }) => { if (!active) return; setMessages(nextMessages); setHasMoreMessages(hasMore); setNextMessageCursor(nextCursor); nextMessages.forEach((message) => { if (message.senderId !== user?.id) api.markRead(message.id).catch(() => undefined); }); }).catch((error) => active && setStatus(error instanceof Error ? error.message : "Mesajlar yuklenemedi.")); return () => { active = false; socketRef.current?.emit("conversation:leave", selectedId); }; }, [selectedId, user?.id]);
  const loadOlderMessages = useCallback(async () => { if (!selectedId || !hasMoreMessages || !nextMessageCursor || isLoadingOlder) return; setIsLoadingOlder(true); try { const page = await api.messages(selectedId, nextMessageCursor); setMessages((current) => [...page.messages.filter((message) => !current.some((item) => item.id === message.id)), ...current]); setHasMoreMessages(page.hasMore); setNextMessageCursor(page.nextCursor); } finally { setIsLoadingOlder(false); } }, [hasMoreMessages, isLoadingOlder, nextMessageCursor, selectedId]);
  if (!user) return <AuthScreen onAuth={setUser} />;
  async function run(action: () => Promise<void>, success?: string) { try { setStatus(""); await action(); if (success) setStatus(success); return true; } catch (error) { setStatus(error instanceof Error ? error.message : "Islem basarisiz."); return false; } }
  const upsertConversation = (conversation: Conversation) => setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
  const isFocusedPage = activeNav === "profile" || activeNav === "admin" || activeNav === "invites";
  return <div className={`app-shell ${isFocusedPage ? "focused-page" : ""}`}><Sidebar active={activeNav} inviteCount={invites.length} onActive={setActiveNav} user={user} onLogout={() => run(async () => { await api.logout(); setUser(null); })} />{activeNav === "invites" ? <InvitesPanel invites={invites} onRespond={(id, action) => run(async () => { const result = await api.respondToInvite(id, action); setInvites((current) => current.filter((invite) => invite.id !== id)); if (result.conversation) { upsertConversation(result.conversation); setSelectedId(result.conversation.id); setActiveNav("all"); } }, action === "accept" ? "Senatoya katildiniz." : action === "block" ? "Senato engellendi." : "Davet reddedildi.")} /> : activeNav === "profile" ? <ProfilePanel user={user} onProfileSave={(displayName, bio) => run(async () => { const { user: nextUser } = await api.updateProfile({ displayName, bio }); setUser(nextUser); }, "Profil kaydedildi.")} onPhoto={(file) => run(async () => { const { photoPath } = await api.uploadPhoto(file); setUser((current) => current ? { ...current, photoPath } : current); }, "Profil fotografi guncellendi.")} /> : activeNav === "admin" && user.adminAccess ? <AdminPanel onBackup={() => run(async () => { const { path } = await api.backup(); setStatus(`Yedek alindi: ${path}`); })} /> : <><ConversationList conversations={conversations} selectedId={selectedId} filter={activeNav} onSelect={setSelectedId} onOpenCreate={() => setCreatePanelOpen(true)} /><ChatPanel user={user} conversation={selected} messages={messages} hasMore={hasMoreMessages} isLoadingOlder={isLoadingOlder} onLoadOlder={loadOlderMessages} typing={typing} onTyping={(active) => selectedId && socketRef.current?.emit(active ? "typing:start" : "typing:stop", selectedId)} onUpload={(file) => selectedId ? api.uploadAttachment(selectedId, file).then(({ attachment }) => attachment) : Promise.reject(new Error("Sohbet secili degil."))} onSend={async (body, attachmentIds) => selectedId ? run(async () => { await api.sendMessage(selectedId, body, attachmentIds); }) : false} onEdit={(id, body) => run(async () => { await api.editMessage(id, body); })} onDelete={(id) => run(async () => { await api.deleteMessage(id); })} onOpenSenate={() => setSenatePanelOpen(true)} onOpenMember={setProfileMemberId} /><CreatePanel open={createPanelOpen} onSearch={searchMembers} onClose={() => setCreatePanelOpen(false)} onCreateDm={(memberId) => run(async () => { const { conversation } = await api.createDm(memberId); upsertConversation(conversation); setSelectedId(conversation.id); })} onCreateSenate={(input) => run(async () => { const { conversation } = await api.createSenate(input); upsertConversation(conversation); setSelectedId(conversation.id); }, "Senato olusturuldu.")} /><SenatePanel open={senatePanelOpen} conversation={selected} user={user} onSearch={searchMembers} onClose={() => setSenatePanelOpen(false)} onSave={(input) => selected?.senateId ? run(async () => { const { conversation } = await api.updateSenate(selected.senateId!, input); upsertConversation(conversation); }, "Senato bilgileri kaydedildi.") : undefined} onInvite={(memberId) => selected?.senateId ? run(async () => { await api.inviteToSenate(selected.senateId!, memberId); }, "Davet gonderildi.") : undefined} onPermission={(memberId, canInvite) => selected?.senateId ? run(async () => { const { conversation } = await api.setInvitePermission(selected.senateId!, memberId, canInvite); upsertConversation(conversation); }, "Davet yetkisi guncellendi.") : undefined} onOpenMember={setProfileMemberId} /></>}<MemberProfileModal memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />{status ? <div className="toast" role="status"><Bell size={16} /><span>{status}</span><button title="Bildirimi kapat" aria-label="Bildirimi kapat" onClick={() => setStatus("")}><X size={16} /></button></div> : null}</div>;
}
