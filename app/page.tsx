"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type User = { id: string; name: string; email: string; initials: string; color: string };
type Member = { name: string; initials: string; color: string; online: boolean; id?: string };
type Message = { id: number; sender: string; initials: string; color: string; time: string; text: string; senderId?: string; mine?: boolean; reaction?: string };
type SocketMessage = { type: "message"; message: Message };

const STORAGE_KEY = "workspace-team-chat-messages";
const TOKEN_KEY = "workspace-chat-token";
const initialMembers: Member[] = [
	{ name: "Aria Chen", initials: "AC", color: "lavender", online: true }, { name: "Marco Rivera", initials: "MR", color: "blue", online: true },
	{ name: "James Okafor", initials: "JO", color: "peach", online: true }, { name: "Priya Nair", initials: "PN", color: "mint", online: false }, { name: "Sofia Lindqvist", initials: "SL", color: "pink", online: false },
];
const initialMessages: Message[] = [
	{ id: 1, sender: "Aria Chen", initials: "AC", color: "lavender", time: "9:15 AM", text: "I'll be there. Can cover for you if needed James!" },
	{ id: 2, sender: "Marco Rivera", initials: "MR", color: "blue", time: "9:20 AM", text: "Perfect, thanks. Also — anyone tried the new coffee machine on the 3rd floor?", reaction: "☕  4" },
	{ id: 3, sender: "Sofia Lindqvist", initials: "SL", color: "pink", time: "9:22 AM", text: "YES. Oat latte is incredible, 10/10 would recommend" },
	{ id: 4, sender: "James Okafor", initials: "JO", color: "peach", time: "9:25 AM", text: "haha I need to check that out. Also heads up — prod deploy tonight at 11 PM EST." },
];

function Avatar({ initials, color, online = false }: { initials: string; color: string; online?: boolean }) { return <span className={`avatar avatar-${color}`}>{initials}{online && <span className="presence" />}</span>; }
function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span>; }

export default function Home() {
	const [user, setUser] = useState<User | null>(null);
	const [authReady, setAuthReady] = useState(false);
	const [authError, setAuthError] = useState("");
	const [authSubmitting, setAuthSubmitting] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [messages, setMessages] = useState<Message[]>(() => {
		if (typeof window === "undefined") return initialMessages;
		try { const saved = window.localStorage.getItem(STORAGE_KEY); return saved ? JSON.parse(saved) as Message[] : initialMessages; } catch { return initialMessages; }
	});
	const [draft, setDraft] = useState("");
	const [search, setSearch] = useState("");
	const [activeChannel, setActiveChannel] = useState("Team Chat");
	const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
	const socketRef = useRef<WebSocket | null>(null);
	const visibleMembers = useMemo(() => {
		if (!user) return [];
		const currentMember: Member = { id: user.id, name: user.name, initials: user.initials, color: user.color, online: true };
		return [currentMember, ...initialMembers].filter((member, index, list) => list.findIndex((item) => item.name === member.name) === index).filter((member) => member.name.toLowerCase().includes(search.toLowerCase()));
	}, [search, user]);

	useEffect(() => {
		const token = window.localStorage.getItem(TOKEN_KEY);
		if (!token) { window.setTimeout(() => setAuthReady(true), 0); return; }
		fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
			.then(async (response) => { if (!response.ok) throw new Error("Your saved session expired. Please enter your details again."); return response.json(); })
			.then((data: { user: User }) => setUser(data.user))
			.catch((error: Error) => { window.localStorage.removeItem(TOKEN_KEY); setAuthError(error.message); })
			.finally(() => setAuthReady(true));
	}, []);

	useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }, [messages]);

	useEffect(() => {
		if (!user) return;
		const protocol = window.location.protocol === "https:" ? "wss" : "ws";
		const token = window.localStorage.getItem(TOKEN_KEY) || "";
		const socket = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
		socketRef.current = socket;
		socket.onopen = () => setConnectionState("connected");
		socket.onmessage = (event) => { try { const payload = JSON.parse(event.data as string) as SocketMessage; if (payload.type !== "message" || payload.message.senderId === user.id) return; setMessages((current) => current.some((message) => message.id === payload.message.id) ? current : [...current, { ...payload.message, mine: false }]); } catch { /* Ignore malformed socket payloads. */ } };
		socket.onclose = () => setConnectionState("offline"); socket.onerror = () => setConnectionState("offline");
		return () => { socket.close(); socketRef.current = null; };
	}, [user]);

	async function createIdentity(event: FormEvent<HTMLFormElement>) {
		event.preventDefault(); setAuthError(""); setAuthSubmitting(true);
		try {
			const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
			const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save your details.");
			window.localStorage.setItem(TOKEN_KEY, data.token); setUser(data.user);
		} catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to save your details."); } finally { setAuthSubmitting(false); }
	}

	function sendMessage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault(); const text = draft.trim(); if (!text || !user) return;
		const message: Message = { id: Date.now(), sender: user.name, initials: user.initials, color: user.color, time: "now", text, senderId: user.id, mine: true };
		if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "message", message } satisfies SocketMessage)); else setMessages((current) => [...current, message]);
		setDraft("");
	}

	if (!authReady) return <main className="auth-shell"><div className="auth-card"><span className="brand-mark">▰</span><h1>Workspace</h1><p>Preparing your chat...</p></div></main>;
	if (!user) return <main className="auth-shell"><form className="auth-card" onSubmit={createIdentity}><span className="brand-mark">▰</span><p className="auth-eyebrow">TEAM CHAT</p><h1>Enter the workspace</h1><p className="auth-copy">Use your name and email once. We’ll remember you next time.</p><label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>{authError && <p className="auth-error">{authError}</p>}<button className="auth-submit" disabled={authSubmitting}>{authSubmitting ? "Saving..." : "Enter chat"}</button><small>Your identity is stored securely in the workspace database.</small></form></main>;

	return <main className="workspace-shell">
		<aside className="sidebar"><div className="brand"><span className="brand-mark"><Icon>▰</Icon></span><strong>Workspace</strong></div><nav className="primary-nav" aria-label="Primary navigation"><button className="nav-item" onClick={() => setActiveChannel("Multi Agent")}><Icon>♧</Icon>Multi Agent</button><button className={`nav-item ${activeChannel === "Team Chat" ? "selected" : ""}`} onClick={() => setActiveChannel("Team Chat")}><Icon>▢</Icon>Team Chat</button></nav><div className="profile"><Avatar initials={user.initials} color={user.color} online /><div><strong>{user.name}</strong><small>Active now</small></div><button className="signout-button" onClick={() => { window.localStorage.removeItem(TOKEN_KEY); setUser(null); }} aria-label="Change user">↗</button></div></aside>
		<section className="chat-panel"><header className="chat-header"><div className="channel-title"><span className="channel-icon"><Icon>♧</Icon></span><div><h1>{activeChannel}</h1><p><span className={`connection-dot ${connectionState}`} />{connectionState === "connected" ? "Live · 4 online" : connectionState === "offline" ? "Offline · saved locally" : "Connecting..."}</p></div></div><div className="header-actions"><div className="avatar-stack">{visibleMembers.slice(0, 4).map((member) => <Avatar key={member.id || member.name} initials={member.initials} color={member.color} online />)}</div><button className="share-button" aria-label="Share chat"><Icon>♧</Icon></button></div></header><div className="message-scroll"><div className="message-list">{messages.map((message) => <article className={`message-row ${message.senderId === user.id ? "mine" : ""}`} key={message.id}>{message.senderId !== user.id && <Avatar initials={message.initials} color={message.color} online />}<div className="message-content"><div className="message-meta"><span className="sender">{message.sender}</span><time>{message.time}</time>{message.senderId === user.id && <span className="you-label">You</span>}</div><div className="bubble">{message.text}</div>{message.reaction && <div className="reaction">{message.reaction}</div>}</div></article>)}</div></div><form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><button type="button" className="plain-button" aria-label="Attach file"><Icon>♧</Icon></button><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activeChannel}...`} /><button type="button" className="plain-button" aria-label="Add emoji"><Icon>☺</Icon></button><button className={`send-button ${draft.trim() ? "ready" : ""}`} aria-label="Send message"><Icon>➤</Icon></button></div><p className="composer-hint"><kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line</p></form></section>
		<aside className="members-panel"><h2>Members</h2><label className="search-box"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." aria-label="Search members" /></label><MemberGroup title={`Online · ${visibleMembers.filter((member) => member.online).length}`} members={visibleMembers.filter((member) => member.online)} /><MemberGroup title={`Offline · ${visibleMembers.filter((member) => !member.online).length}`} members={visibleMembers.filter((member) => !member.online)} offline /></aside><button className="help-button" aria-label="Help">?</button>
	</main>;
}

function MemberGroup({ title, members, offline = false }: { title: string; members: Member[]; offline?: boolean }) { return <div className={`member-group ${offline ? "offline" : ""}`}><h3>{title}</h3>{members.map((member) => <div className="member-row" key={member.id || member.name}><Avatar initials={member.initials} color={member.color} online={member.online} /><div><strong>{member.name}</strong><small>{member.online ? "Active" : "Offline"}</small></div></div>)}</div>; }
