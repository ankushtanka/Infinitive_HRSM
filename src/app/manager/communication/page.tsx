'use client';
import { Portal } from '@/components/modals/Portal';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  MessageSquare,
  Send,
  Paperclip,
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  Lock,
  User as UserIcon,
  Building2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Clock,
  Sparkles,
  Users,
  MessageCircle,
  Inbox,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { formatISTDate, formatISTTime } from '@/lib/dateUtils';

interface TeamMember {
  id: string;
  employeeId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  department: string;
  designation: string;
  photo?: string | null;
  avatar?: string | null;
}

interface Conversation {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  employeeEmail?: string;
  department?: string;
  subject: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCountHr: number;
  unreadCountEmployee: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Attachment {
  fileId: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes?: number;
  mimeType: string;
  fileUrl: string;
}

interface Message {
  id: string;
  conversationId: string;
  organizationId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  senderAvatar?: string;
  receiverId: string;
  message: string;
  attachments: Attachment[];
  readAt?: string | null;
  createdAt: string;
}

interface CommunicationKPIs {
  totalConversations: number;
  unreadConversations: number;
  activeConversations: number;
  messagesToday: number;
}

function getISTRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatISTDate(dateStr);
  } catch {
    return formatISTDate(dateStr);
  }
}

export default function ManagerCommunicationPage() {
  const { user } = useAuthStore();

  // State Management
  const [authorizedTeam, setAuthorizedTeam] = useState<TeamMember[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [kpis, setKpis] = useState<CommunicationKPIs>({
    totalConversations: 0,
    unreadConversations: 0,
    activeConversations: 0,
    messagesToday: 0,
  });

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Loading & Action States
  const [isLoadingHub, setIsLoadingHub] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Form & Search Inputs
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);

  // Modal State
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);

  // Application-wide background scroll lock while manager new message modal is open
  useBodyScrollLock(isNewMessageModalOpen);
  const [modalRecipientId, setModalRecipientId] = useState('');
  const [modalSubject, setModalSubject] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // UI Toast & Error States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mobile Navigation State ('threads' | 'chat')
  const [mobileView, setMobileView] = useState<'threads' | 'chat'>('threads');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch Manager Communication Data (Hub Endpoint)
  const fetchHubData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoadingHub(true);
    }
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/manager/communication?search=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('Access denied. Manager role required.');
        throw new Error('Failed to load team communication hub data.');
      }

      const data = await res.json();
      if (data.success) {
        setAuthorizedTeam(data.authorizedTeam || []);
        setConversations(data.conversations || []);
        if (data.kpis) setKpis(data.kpis);

        if (isManualRefresh) {
          showToast('Team inbox refreshed successfully');
        }
      } else {
        throw new Error(data.message || 'Failed to fetch messages');
      }
    } catch (err: any) {
      console.error('Error fetching manager communication data:', err);
      setErrorMessage(err?.message || 'A network error occurred while loading team messages.');
    } finally {
      setIsLoadingHub(false);
      setIsRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  // Auto-scroll messages stream to bottom
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 2. Handle Selecting a Conversation Thread
  const handleSelectConversation = async (convId: string) => {
    setSelectedConvId(convId);
    setMobileView('chat');
    setIsLoadingMessages(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/messages/conversations/${convId}`);
      if (!res.ok) {
        throw new Error('Failed to load conversation thread.');
      }
      const data = await res.json();
      if (data.success) {
        setSelectedConv(data.conversation);
        setMessages(data.messages || []);

        // Locally clear unread badge for this conversation thread
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCountHr: 0 } : c))
        );
        setKpis((prev) => ({
          ...prev,
          unreadConversations: Math.max(0, prev.unreadConversations - 1),
        }));
      } else {
        throw new Error(data.message || 'Failed to load thread messages.');
      }
    } catch (err: any) {
      console.error('Error loading conversation:', err);
      setErrorMessage(err?.message || 'Failed to load conversation details.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // 3. Send Message / Reply Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConvId) return;
    if (!replyText.trim() && !replyFile) return;
    if (isSendingMessage) return;

    setIsSendingMessage(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      if (replyText.trim()) formData.append('message', replyText.trim());
      if (replyFile) {
        if (replyFile.size > 10 * 1024 * 1024) {
          throw new Error('Attachment file size exceeds maximum limit of 10MB.');
        }
        formData.append('file', replyFile);
      }

      const res = await fetch(`/api/v1/messages/conversations/${selectedConvId}`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send message.');
      }

      if (data.reply) {
        setMessages((prev) => [...prev, data.reply]);
        setReplyText('');
        setReplyFile(null);

        // Update conversation in sidebar list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConvId
              ? {
                  ...c,
                  lastMessage: data.reply.message,
                  lastMessageAt: data.reply.createdAt,
                  updatedAt: data.reply.createdAt,
                }
              : c
          )
        );

        // Update KPIs
        setKpis((prev) => ({
          ...prev,
          messagesToday: prev.messagesToday + 1,
        }));
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setErrorMessage(err?.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Handle Enter to send, Shift+Enter for newline
  const handleKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 4. Create New Conversation Handler
  const handleCreateNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRecipientId) {
      setModalError('Please select a recipient from your team.');
      return;
    }
    if (!modalSubject.trim()) {
      setModalError('Please enter a message subject.');
      return;
    }
    if (!modalMessage.trim() && !modalFile) {
      setModalError('Please enter message text or select an attachment.');
      return;
    }

    setIsModalSubmitting(true);
    setModalError('');

    try {
      const formData = new FormData();
      formData.append('employeeId', modalRecipientId);
      formData.append('subject', modalSubject.trim());
      formData.append('message', modalMessage.trim());
      if (modalFile) {
        if (modalFile.size > 10 * 1024 * 1024) {
          throw new Error('File size exceeds maximum allowed limit of 10MB.');
        }
        formData.append('file', modalFile);
      }

      const res = await fetch('/api/v1/messages/conversations', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to start conversation.');
      }

      showToast('Message sent successfully!');

      // Close modal and reset form
      setIsNewMessageModalOpen(false);
      setModalRecipientId('');
      setModalSubject('');
      setModalMessage('');
      setModalFile(null);

      // Refresh hub data and select newly created conversation thread
      await fetchHubData();
      if (data.conversation?.id) {
        handleSelectConversation(data.conversation.id);
      }
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      setModalError(err?.message || 'Failed to send message.');
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Filter conversations locally by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.employeeName.toLowerCase().includes(q) ||
        c.employeeId.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        (c.department && c.department.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 text-white px-5 py-3 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Manager Header & Context */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Team Communication</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
              <ShieldCheck className="h-3 w-3" /> Manager Workspace
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user?.name || 'Manager'}</span> ({user?.employeeId || 'ID'}). Communicate privately with your authorized team members.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchHubData(true)}
            disabled={isRefreshing || isLoadingHub}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Inbox</span>
          </button>
          <button
            onClick={() => setIsNewMessageModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Message</span>
          </button>
        </div>
      </div>

      {/* 4 Live Team KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Threads</span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoadingHub ? '...' : kpis.totalConversations}</p>
          <span className="text-[10px] text-slate-400 font-medium">Team conversations</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unread Messages</span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoadingHub ? '...' : kpis.unreadConversations}</p>
          <span className="text-[10px] text-amber-600 font-semibold">Awaiting review</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Threads</span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <MessageCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoadingHub ? '...' : kpis.activeConversations}</p>
          <span className="text-[10px] text-slate-400 font-medium">Updated last 30 days</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Messages Today</span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{isLoadingHub ? '...' : kpis.messagesToday}</p>
          <span className="text-[10px] text-slate-400 font-medium">IST ({formatISTDate(new Date().toISOString())})</span>
        </div>
      </div>

      {/* Global Error Alert */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span className="font-medium flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 font-bold">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Dual-Panel Enterprise Chat Workspace */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden min-h-[600px] flex flex-col lg:flex-row">
        {/* LEFT PANEL: Conversation Sidebar (~340px) */}
        <div
          className={`w-full lg:w-80 lg:min-w-[320px] lg:max-w-[360px] border-r border-slate-200 bg-slate-50/50 flex flex-col ${
            mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Sidebar Search & Header */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-600" /> Authorized Team Conversations
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {filteredConversations.length}
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search team member or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Conversations Thread List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingHub ? (
              <div className="p-8 text-center space-y-3">
                <Loader2 className="h-6 w-6 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-medium">Loading team threads...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No conversations found</p>
                <p className="text-[11px] text-slate-400">
                  {searchQuery ? 'No conversations match your search query.' : 'Click "New Message" to message a team member.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConvId === conv.id;
                const hasUnread = conv.unreadCountHr > 0;

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full p-4 text-left transition-all cursor-pointer flex items-start gap-3 hover:bg-slate-100/80 ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'bg-white'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {conv.employeeAvatar ? (
                        <img
                          src={conv.employeeAvatar}
                          alt={conv.employeeName}
                          className="h-10 w-10 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center font-bold text-xs text-indigo-700">
                          {conv.employeeName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 border-2 border-white" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${hasUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>
                          {conv.employeeName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {getISTRelativeTime(conv.lastMessageAt)}
                        </span>
                      </div>

                      <span className="text-[10px] text-slate-400 block truncate font-medium">
                        {conv.department ? `${conv.department} • ` : ''}{conv.subject}
                      </span>

                      <p className={`text-xs mt-1 truncate ${hasUnread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                        {conv.lastMessage || 'No content'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Chat Workspace */}
        <div
          className={`flex-1 flex flex-col bg-white ${
            mobileView === 'threads' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  {/* Mobile Back Button */}
                  <button
                    onClick={() => setMobileView('threads')}
                    className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                  {/* Recipient Avatar & Identity */}
                  <div className="relative">
                    {selectedConv.employeeAvatar ? (
                      <img
                        src={selectedConv.employeeAvatar}
                        alt={selectedConv.employeeName}
                        className="h-10 w-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center font-bold text-sm text-indigo-700">
                        {selectedConv.employeeName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{selectedConv.employeeName}</span>
                      <span className="text-[10px] font-mono font-normal text-slate-400">({selectedConv.employeeId})</span>
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Subject: <span className="font-medium text-slate-700">{selectedConv.subject}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-400 font-mono">
                  <span>IST Thread</span>
                </div>
              </div>

              {/* Message Stream */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/40">
                {isLoadingMessages ? (
                  <div className="p-12 text-center space-y-3">
                    <Loader2 className="h-6 w-6 text-indigo-600 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400">Loading conversation history...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    No messages in this thread yet. Send a message to get started.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isManagerSender = msg.senderRole === 'MANAGER' || msg.senderId === user?.id || msg.senderId === user?.employeeId;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isManagerSender ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 text-xs shadow-2xs space-y-2 ${
                            isManagerSender
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                          }`}
                        >
                          {/* Sender Info */}
                          <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 font-medium pb-1 border-b border-white/10">
                            <span>{msg.senderName || (isManagerSender ? 'Manager' : 'Team Member')}</span>
                            <span>{formatISTTime(msg.createdAt)}</span>
                          </div>

                          {/* Message Content */}
                          <p className="whitespace-pre-wrap leading-relaxed font-sans">{msg.message}</p>

                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="pt-2 space-y-1.5 border-t border-white/10">
                              {msg.attachments.map((att, idx) => (
                                <a
                                  key={idx}
                                  href={`${att.fileUrl}?download=true`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center justify-between gap-2 p-2 rounded-xl text-[11px] transition-colors ${
                                    isManagerSender
                                      ? 'bg-indigo-700/80 hover:bg-indigo-800 text-white'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <FileText className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate font-medium">{att.fileName}</span>
                                  </div>
                                  <Download className="h-3.5 w-3.5 shrink-0" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-400 mt-1 px-1 font-mono">
                          {formatISTDate(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <form onSubmit={handleSendMessage} className="space-y-3">
                  {/* Selected File Badge */}
                  {replyFile && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-900">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                        <span className="truncate font-semibold">{replyFile.name}</span>
                        <span className="text-[10px] text-indigo-500 font-mono">({(replyFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyFile(null)}
                        className="text-indigo-400 hover:text-indigo-700 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {/* Attachment Button */}
                    <label className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 cursor-pointer transition-colors shrink-0">
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            if (file.size > 10 * 1024 * 1024) {
                              setErrorMessage('File size must be under 10MB.');
                              return;
                            }
                            setReplyFile(file);
                          }
                        }}
                      />
                    </label>

                    {/* Textarea Input */}
                    <textarea
                      ref={textareaRef}
                      rows={2}
                      placeholder="Type a message to your team member... (Enter to send, Shift+Enter for newline)"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDownTextarea}
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none transition-all"
                    />

                    {/* Send Button */}
                    <button
                      type="submit"
                      disabled={isSendingMessage || (!replyText.trim() && !replyFile)}
                      className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            /* Empty State: No Selected Conversation */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <MessageSquare className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Select a Conversation Thread</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Choose a team member conversation from the left sidebar or click &quot;New Message&quot; to start a private thread with a direct report.
                </p>
              </div>
              <button
                onClick={() => setIsNewMessageModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>New Team Message</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NEW MESSAGE MODAL */}
      {isNewMessageModalOpen && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-400/30">
                  <MessageSquare className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white">New Private Team Message</h2>
                  <p className="text-[11px] text-slate-400">Send direct communication to an authorized direct report</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewMessageModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateNewConversation} className="p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Select Recipient (Restricted to Authorized Team Members) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Team Recipient <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select
                    value={modalRecipientId}
                    onChange={(e) => setModalRecipientId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    required
                  >
                    <option value="">-- Choose Direct Report ({authorizedTeam.length} Members) --</option>
                    {authorizedTeam.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId}) - {emp.department}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Subject / Topic <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Project Update / Performance Review Discussion"
                  value={modalSubject}
                  onChange={(e) => setModalSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Message Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Write your private message here..."
                  value={modalMessage}
                  onChange={(e) => setModalMessage(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none transition-all"
                  required
                />
              </div>

              {/* File Attachment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Attachment (Optional, max 10MB)
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setModalFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewMessageModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isModalSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isModalSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
