import type { StartAvatarResponse } from "@heygen/streaming-avatar";

import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents, TaskMode, TaskType, VoiceEmotion,
} from "@heygen/streaming-avatar";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Chip,
  Tabs,
  Tab,
} from "@nextui-org/react";
import { useChat } from "ai/react";
import OpenAI from "openai";
import LangflowClient from "@/app/lib/LangflowClient";
import FlowiseClient from "@/app/lib/FlowiseClient";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, usePrevious } from "ahooks";

import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

import {AVATARS, VOICES, STT_LANGUAGE_LIST} from "@/app/lib/constants";
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Instantiate a new LangflowClient
const LANGFLOW_API_KEY = process.env.NEXT_PUBLIC_LANGFLOW_API_KEY ?? "";
const LANGFLOW_BASE_URL = process.env.NEXT_PUBLIC_LANGFLOW_BASE_URL ?? "";
const langflowClient = new LangflowClient(
  LANGFLOW_BASE_URL,
  LANGFLOW_API_KEY
);

// Instantiate a new FlowiseClient
const FLOWISE_API_KEY = process.env.NEXT_PUBLIC_FLOWISE_API_KEY ?? "";
const FLOWISE_BASE_URL = process.env.NEXT_PUBLIC_FLOWISE_BASE_URL ?? "";
const flowiseClient = new FlowiseClient(
  FLOWISE_BASE_URL,
  FLOWISE_API_KEY
);

export default function InteractiveAvatar() {
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [knowledgeId, setKnowledgeId] = useState<string>("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [language, setLanguage] = useState<string>('en');
  const [voiceId, setVoiceId] = useState<string>("");
  const [quality, setQuality] = useState<AvatarQuality>(AvatarQuality.Medium);

  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [chatMode, setChatMode] = useState("text_mode");
  const [isUserTalking, setIsUserTalking] = useState(false);

  const { input, setInput, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response:", message);

      if (!avatar.current) {
        setDebug("Avatar API not initialized");
        return;
      }

      //send the ChatGPT response to the Interactive Avatar
      await avatar.current
        .speak({
          text: message.content, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC
        })
        .catch((e) => {
          setDebug(e.message);
        });
      setIsLoadingChat(false);
    },
    initialMessages: [
      {
        id: "1",
        role: "system",
        content: "You are a helpful assistant.",
      },
    ],
  });


  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token); // Log the token to verify

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
    }

    return "";
  }

  async function startSession() {
    setIsLoadingSession(true);
    const newToken = await fetchAccessToken();

    avatar.current = new StreamingAvatar({
      token: newToken,
    });
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
      console.log("Avatar started talking", e);
    });
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
      console.log("Avatar stopped talking", e);
    });
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    avatar.current?.on(StreamingEvents.STREAM_READY, (event) => {
      console.log(">>>>> Stream ready:", event.detail);
      setStream(event.detail);
    });
    avatar.current?.on(StreamingEvents.USER_START, (event) => {
      console.log(">>>>> User started talking:", event);
      setIsUserTalking(true);
    });
    avatar.current?.on(StreamingEvents.USER_STOP, (event) => {
      console.log(">>>>> User stopped talking:", event);
      setIsUserTalking(false);
    });
    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: avatarId,
        knowledgeId: knowledgeId, // Or use a custom `knowledgeBase`.
        voice: {
          rate: 1.5, // 0.5 ~ 1.5
          emotion: VoiceEmotion.EXCITED,
          // elevenlabsSettings: {
          //   stability: 1,
          //   similarity_boost: 1,
          //   style: 1,
          //   use_speaker_boost: false,
          // },
        },
        language: language,
        disableIdleTimeout: true,
      });

      setData(res);
      // default to voice mode
      await avatar.current?.startVoiceChat({
        useSilencePrompt: false
      });
      setChatMode("voice_mode");
    } catch (error) {
      console.error("Error starting avatar session:", error);
    } finally {
      setIsLoadingSession(false);
    }
  }
  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    // speak({ text: text, task_type: TaskType.REPEAT })
    await avatar.current.speak({ text: text, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC }).catch((e) => {
      setDebug(e.message);
    });
    setIsLoadingRepeat(false);
  }
  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current
      .interrupt()
      .catch((e) => {
        setDebug(e.message);
      });
  }
  async function endSession() {
    await avatar.current?.stopAvatar();
    setStream(undefined);
  }

  const handleChangeChatMode = useMemoizedFn(async (v) => {
    if (v === chatMode) {
      return;
    }
    if (v === "text_mode") {
      avatar.current?.closeVoiceChat();
    } else {
      await avatar.current?.startVoiceChat();
    }
    setChatMode(v);
  });

  const previousText = usePrevious(text);
  useEffect(() => {
    if (!previousText && text) {
      avatar.current?.startListening();
    } else if (previousText && !text) {
      avatar?.current?.stopListening();
    }
  }, [text, previousText]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    const fetchSessionId = async () => {
      // Get the session ID from the session API endpoint
      const response = await fetch("/api/session", {
        method: "GET",
      });
      const sessionCookie = await response.text(); // Declare and assign the value of sessionCookie
      setChatSessionId(sessionCookie);
      console.log("SessionID: ", sessionCookie);
    };
  
    fetchSessionId();
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [mediaStream, stream]);
  async function handleSubmitToLangflow() {

    const flowIdOrName = process.env.NEXT_PUBLIC_LANGFLOW_ENDPOINT ?? "";
    const langflowId = process.env.NEXT_PUBLIC_LANGFLOW_FLOW_ID ?? "";
    const inputValue = input;
    const stream = false;
    const tweaks = {
      "ChatInput-AEH7b": {},
      "AstraVectorStoreComponent-KGShY": {},
      "ParseData-KThnt": {},
      "Prompt-NJmAO": {},
      "ChatOutput-YV57G": {},
      "AstraVectorStoreComponent-seBT4": {},
      "OpenAIEmbeddings-eS4p1": {},
      "OpenAIEmbeddings-ZpgE1": {},
      "OpenAIModel-u4eQs": {},
      "FirecrawlCrawlApi-8rreb": {},
      "FirecrawlScrapeApi-qW6sy": {},
      "SplitText-VNK9A": {},
      "AstraVectorize-eBOo3": {},
      "AstraVectorize-qdTfB": {},
      "ParseData-RT6hq": {},
      "FilterData-rQcI1": {},
      "RecursiveCharacterTextSplitter-hg0BJ": {},
      "CreateData-2ESH7": {},
      "File-WsZ45": {},
      "URL-WgEGh": {},
      "IDGenerator-T9ST2": {}
    };
    let response = await langflowClient.runFlow(
        flowIdOrName,
        langflowId,
        inputValue,
        tweaks,
        stream,
        (data) => console.log("Received:", data.chunk), // onUpdate
        (message) => console.log("Stream Closed:", message), // onClose
        (error) => console.log("Stream Error:", error) // onError
    );
    if (!stream) {
        const flowOutputs = response.outputs[0];
        const firstComponentOutputs = flowOutputs.outputs[0];
        const output = firstComponentOutputs.outputs.message;
        // outputs[0].outputs[0].outputs.message.message.text
        const message = output.message;
        console.log("Final Output:", message.text);

        // Send the response to the Interactive Avatar
        if (!avatar.current) {
          setDebug("Avatar API not initialized");
          return;
        }
  
        //send the Langflow response to the Interactive Avatar
        await avatar.current
          .speak({
            text: message.text, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC
          })
          .catch((e) => {
            setDebug(e.message);
          });
        setIsLoadingChat(false);
        setInput("");          
    }

  } 

  async function handleSubmitToFlowise() {

    const flowIdOrName = process.env.NEXT_PUBLIC_FLOW_ID ?? "";
    const inputValue = input;
    const overrideConfig = { sessionId: chatSessionId };
    let response = await flowiseClient.runFlow(
        flowIdOrName,
        inputValue,
        overrideConfig,
        (data) => console.log("Received:", data.chunk), // onUpdate
        (message) => console.log("Stream Closed:", message), // onClose
        (error) => console.log("Stream Error:", error) // onError
    );
    console.log("Final Output:", response.text);

    // Send the response to the Interactive Avatar
    if (!avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }

    //send the Flowise response to the Interactive Avatar
    await avatar.current
      .speak({
        text: response.text, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC
      })
      .catch((e) => {
        setDebug(e.message);
      });
    setIsLoadingChat(false);
    setInput("");          

  } 


  return (
    <div className="w-full flex flex-col gap-4">
      <Card>
        <CardBody className="h-[700px] flex flex-col justify-start items-center pt-8 overflow-y-auto">
          {stream ? (
            <div className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              >
                <track kind="captions" />
              </video>
              <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                <Button
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                  size="md"
                  variant="shadow"
                  onClick={handleInterrupt}
                >
                  Interrupt task
                </Button>
                <Button
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300  text-white rounded-lg"
                  size="md"
                  variant="shadow"
                  onClick={endSession}
                >
                  End session
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div className="h-full justify-center items-center flex flex-col gap-8 w-[500px] self-center">
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Custom Knowledge ID (optional)
                </p>
                <Input
                  placeholder="Enter a custom knowledge ID"
                  value={knowledgeId}
                  aria-label="Custom knowledge ID"
                  onChange={(e) => setKnowledgeId(e.target.value)}
                />
                <p className="text-sm font-medium leading-none">
                  Custom Avatar ID (optional)
                </p>
                <Input
                  placeholder="Enter a custom avatar ID"
                  value={avatarId}
                  aria-label="Custom avatar ID"
                  onChange={(e) => setAvatarId(e.target.value)}
                />
                <Select
                  label="Select avatar"
                  aria-label="Select avatar"
                  placeholder="Or select one from these example avatars"
                  size="md"
                  onChange={(e) => {
                    setAvatarId(e.target.value);
                  }}
                >
                  {AVATARS.map((avatar) => (
                    <SelectItem
                      key={avatar.avatar_id}
                      textValue={avatar.avatar_id}
                    >
                      {avatar.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Custom Voice ID (optional)
                </p>
                <Input
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  placeholder="Enter a custom voice ID"
                  aria-label="Custom voice ID"
                />
                <Select
                  label="Select voice"
                  aria-label="Select voice"
                  placeholder="Or select one from these example voices"
                  size="md"
                  onChange={(e) => {
                    setVoiceId(e.target.value);
                  }}
                >
                  {VOICES.map((voice) => (
                    <SelectItem key={voice.voice_id} textValue={voice.voice_id}>
                      {voice.name} | {voice.language} | {voice.gender}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Quality
                </p>
                <Select
                  label="Select quality"
                  aria-label="Select quality"
                  placeholder="Select quality"
                  size="md"
                  value={quality}
                  onChange={(e) => {
                    setQuality(e.target.value as AvatarQuality);
                  }}
                >
                  <SelectItem value="low" key={"low"}>Low</SelectItem>
                  <SelectItem value="medium" key={"medium"}>Medium</SelectItem>
                  <SelectItem value="high" key={"high"}>High</SelectItem>
                </Select>
                <Select
                  label="Select language"
                  aria-label="Select language"
                  placeholder="Select language"
                  className="max-w-xs"
                  selectedKeys={[language]}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                  }}
                >
                  {STT_LANGUAGE_LIST.map((lang) => (
                    <SelectItem key={lang.key}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <Button
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 w-full text-white"
                size="md"
                variant="shadow"
                onClick={startSession}
              >
                Start session
              </Button>
            </div>
          ) : (
            <Spinner color="default" size="lg" />
          )}
        </CardBody>
        <Divider />
        <CardFooter className="flex flex-col gap-3">
          <Tabs
            aria-label="Options"
            selectedKey={chatMode}
            onSelectionChange={(v) => {
              handleChangeChatMode(v);
            }}
          >
            <Tab key="text_mode" title="Text mode" />
            <Tab key="voice_mode" title="Voice mode" />
          </Tabs>
          {chatMode === "text_mode" ? (
            <div className="w-full flex flex-col gap-4 relative">
              <InteractiveAvatarTextInput
                disabled={!stream}
                input={text}
                label="Repeat"
                aria-label="Repeat"
                loading={isLoadingRepeat}
                placeholder="Type something for the avatar to respond"
                setInput={setText}
                onSubmit={handleSpeak}
              />
              <InteractiveAvatarTextInput
                label="Chat-GPT"
                aria-label="ChatGPT"
                placeholder="Chat with the avatar (uses ChatGPT)"
                input={input}
                onSubmit={() => {
                  setIsLoadingChat(true);
                  if (!input) {
                    setDebug("Please enter text to send to ChatGPT");
                    return;
                  }
                  handleSubmit();
                }}
                setInput={setInput}
                disabled={!stream}
                loading={isLoadingChat}
              />
              <InteractiveAvatarTextInput
                label="AI Agent"
                aria-label="AI Agent"
                placeholder="Chat with the AI Agent"
                input={input}
                onSubmit={() => {
                  setIsLoadingChat(true);
                  if (!input) {
                    setDebug("Please enter a message to interact with the AI Agent");
                    return;
                  }
                  handleSubmitToFlowise();
                }}
                setInput={setInput}
                disabled={!stream}
                loading={isLoadingChat}
              />
              {text && (
                <Chip className="absolute right-16 top-3">Listening</Chip>
              )}
            </div>
          ) : (
            <div className="w-full text-center">
              <Button
                isDisabled={!isUserTalking}
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
                size="md"
                variant="shadow"
              >
                {isUserTalking ? "Listening" : "Voice chat"}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
      <p className="font-mono text-right">
        <span className="font-bold">Console:</span>
        <br />
        {debug}
      </p>
    </div>
  );
}
