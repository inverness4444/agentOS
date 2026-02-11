type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatThreadProps = {
  messages: Message[];
  isRunning: boolean;
};

export default function ChatThread({ messages, isRunning }: ChatThreadProps) {
  return (
    <div className="space-y-3">
      {messages.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-6 text-center text-xs text-[#5A6072]">
          Сообщений пока нет. Запустите агента.
        </div>
      )}
      {messages.map((message) => (
        <div
          key={message.id}
          className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
            message.role === "user"
              ? "ml-auto bg-[#5C5BD6] text-white"
              : "bg-white text-[#1F2238] border border-slate-200/70"
          }`}
        >
          {message.content}
        </div>
      ))}
      {isRunning && (
        <div className="max-w-[60%] rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#5A6072]">
          running...
        </div>
      )}
    </div>
  );
}
