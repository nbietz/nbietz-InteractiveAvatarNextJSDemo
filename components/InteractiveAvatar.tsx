import { AVATARS, VOICES } from "@/app/lib/constants";
import {
  Configuration,
  NewSessionData,
  NewSessionRequestQualityEnum,
  StreamingAvatarApi,
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
  Tooltip,
} from "@nextui-org/react";
import { Microphone, MicrophoneStage } from "@phosphor-icons/react";
import { useChat } from "ai/react";
import clsx from "clsx";
import OpenAI from "openai";
import LangflowClient from "@/app/lib/LangflowClient";
import FlowiseClient from "@/app/lib/FlowiseClient";
import { useEffect, useRef, useState } from "react";
import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

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
  const [avatarId, setAvatarId] = useState<string>("");
  const [voiceId, setVoiceId] = useState<string>("");
  const [quality, setQuality] = useState<NewSessionRequestQualityEnum>("medium");
  const [data, setData] = useState<NewSessionData>();
  const [text, setText] = useState<string>("");
  const [initialized, setInitialized] = useState(false); // Track initialization
  const [recording, setRecording] = useState(false); // Track recording state
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasStream, setCanvasStream] = useState<MediaStream | null>(null);

  const { input, setInput, handleSubmit } = useChat({
    onFinish: async (message) => {
      console.log("ChatGPT Response:", message);

      if (!initialized || !avatar.current) {
        setDebug("Avatar API not initialized");
        return;
      }

      //send the ChatGPT response to the Interactive Avatar
      await avatar.current
        .speak({
          taskRequest: { text: message.content, sessionId: data?.sessionId },
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
      //console.log("Access Token:", token); // Log the token to verify
      console.log("Access Token obtained");
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      return "";
    }
  }

  async function startSession() {
    setIsLoadingSession(true);
    await updateToken();
    if (!avatar.current) {
      setDebug("Avatar API is not initialized");
      return;
    }
    try {
      const res = await avatar.current.createStartAvatar(
        {
          newSessionRequest: {
            quality: quality,
            avatarName: avatarId,
            voice: { voiceId: voiceId },
          },
        },
        setDebug
      );
      setData(res);
      console.log("Session started:", data);
      setDebug(`Session started ${res.sessionId}`);
      setStream(avatar.current.mediaStream);
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(
        `There was an error starting the session. ${voiceId ? "This custom Voice or Avatar may not be supported." : ""}`
      );
    }
    setIsLoadingSession(false);
  }

  async function updateToken() {
    const newToken = await fetchAccessToken();
    //console.log("Updating Access Token:", newToken); // Log token for debugging
    console.log("Updating Access Token:");
    avatar.current = new StreamingAvatarApi(
      new Configuration({ accessToken: newToken })
    );

    const startTalkCallback = (e: any) => {
      console.log("Avatar started talking", e);
    };

    const stopTalkCallback = (e: any) => {
      console.log("Avatar stopped talking", e);
    };

    console.log("Adding event handlers:", avatar.current);
    avatar.current.addEventHandler("avatar_start_talking", startTalkCallback);
    avatar.current.addEventHandler("avatar_stop_talking", stopTalkCallback);

    setInitialized(true);
  }

  async function handleInterrupt() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current
      .interrupt({ interruptRequest: { sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
  }

  async function endSession() {
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current.stopAvatar(
      { stopSessionRequest: { sessionId: data?.sessionId } },
      setDebug
    );
    setStream(undefined);
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current
      .speak({ taskRequest: { text: text, sessionId: data?.sessionId } })
      .catch((e) => {
        setDebug(e.message);
      });
    setIsLoadingRepeat(false);
  }

  useEffect(() => {
    async function init() {
      const newToken = await fetchAccessToken();
      //console.log("Initializing with Access Token:", newToken); // Log token for debugging
      console.log("Obtained HeyGen Access Token. Initializing Avatar API...");
      avatar.current = new StreamingAvatarApi(
        new Configuration({ accessToken: newToken, jitterBuffer: 200 })
      );
      setInitialized(true); // Set initialized to true
      setDebug("Avatar API initialized");
    }
    init();

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
    if (stream && mediaStream.current && canvasRef.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
        applyChromaKey();
      };
    }
  }, [mediaStream, stream]);

  function applyChromaKey() {
    if (!mediaStream.current || !canvasRef.current) return;

    const video = mediaStream.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];

        // Adjust these values for better green screen detection
        const threshold = 100;
        const greenDominance = 1.5;

        if (green > threshold && green > red * greenDominance && green > blue * greenDominance) {
          // Make pixel fully transparent
          data[i + 3] = 0;
        } else if (green > red && green > blue) {
          // For pixels that are greenish but not fully green, reduce green component
          const greenness = (green - Math.max(red, blue)) / 255;
          data[i + 1] = Math.max(0, green - greenness * 100);
          data[i + 3] = Math.max(0, 255 - greenness * 200);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      requestAnimationFrame(drawFrame);
    };

    drawFrame();

    // Create a new MediaStream from the canvas
    const canvasStream = canvas.captureStream();
    setCanvasStream(canvasStream);
  }

  function startRecording() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaRecorder.current = new MediaRecorder(stream);
          mediaRecorder.current.ondataavailable = (event) => {
            audioChunks.current.push(event.data);
          };
          mediaRecorder.current.onstop = () => {
            const audioBlob = new Blob(audioChunks.current, {
              type: "audio/wav",
            });
            audioChunks.current = [];
            transcribeAudio(audioBlob);
          };
          mediaRecorder.current.start();
          setRecording(true);
        })
        .catch((error) => {
          console.error("Error accessing microphone:", error);
          setDebug("Error accessing microphone");
        });
    } else {
      console.error("getUserMedia is not supported in this browser.");
      setDebug("getUserMedia is not supported in this browser.");
    }
  }

  function stopRecording() {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  }

  async function transcribeAudio(audioBlob: Blob) {
    try {
      // Convert Blob to File
      const audioFile = new File([audioBlob], "recording.wav", {
        type: "audio/wav",
      });
      const response = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: audioFile,
      });
      const transcription = response.text;
      console.log("Transcription: ", transcription);
      setInput(transcription);
    } catch (error) {
      console.error("Error transcribing audio:", error);
    }
  }

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
        if (!initialized || !avatar.current) {
          setDebug("Avatar API not initialized");
          return;
        }
  
        //send the ChatGPT response to the Interactive Avatar
        await avatar.current
          .speak({
            taskRequest: { text: message.text, sessionId: data?.sessionId },
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
    if (!initialized || !avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }

    //send the ChatGPT response to the Interactive Avatar
    await avatar.current
      .speak({
        taskRequest: { text: response.text, sessionId: data?.sessionId },
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
        <CardBody className="h-[500px] flex flex-col justify-center items-center">
          {stream ? (
            <div className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden relative">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                style={{ display: 'none' }}
              >
                <track kind="captions" />
              </video>
              <canvas
                ref={canvasRef}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  backgroundColor: "transparent",
                }}
              />
              <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                <Button
                  size="md"
                  onClick={handleInterrupt}
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                  variant="shadow"
                >
                  Interrupt task
                </Button>
                <Button
                  size="md"
                  onClick={endSession}
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300  text-white rounded-lg"
                  variant="shadow"
                >
                  End session
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div className="h-full justify-center items-center flex flex-col gap-8 w-[500px] self-center">
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Custom Avatar ID (optional)
                </p>
                <Input
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                  placeholder="Enter a custom avatar ID"
                />
                <Select
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
                />
                <Select
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
                  size="md"
                  value={quality}
                  onChange={(e) => {
                    setQuality(e.target.value as NewSessionRequestQualityEnum);
                  }}
                >
                  <SelectItem value="low" key={"low"}>Low</SelectItem>
                  <SelectItem value="medium" key={"medium"}>Medium</SelectItem>
                  <SelectItem value="high" key={"high"}>High</SelectItem>
                </Select>
              </div>

              <Button
                size="md"
                onClick={startSession}
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 w-full text-white"
                variant="shadow"
              >
                Start session
              </Button>
            </div>
          ) : (
            <Spinner size="lg" color="default" />
          )}
        </CardBody>
        <Divider />
        <CardFooter className="flex flex-col gap-3">
          <InteractiveAvatarTextInput
            label="Repeat"
            aria-label="Repeat"
            placeholder="Type something for the avatar to repeat"
            input={text}
            onSubmit={handleSpeak}
            setInput={setText}
            disabled={!stream}
            loading={isLoadingRepeat}
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
            endContent={
              <Tooltip
                content={!recording ? "Start recording" : "Stop recording"}
              >
                <Button
                  onClick={!recording ? startRecording : stopRecording}
                  isDisabled={!stream}
                  isIconOnly
                  className={clsx(
                    "mr-4 text-white",
                    !recording
                      ? "bg-gradient-to-tr from-indigo-500 to-indigo-300"
                      : ""
                  )}
                  size="sm"
                  variant="shadow"
                >
                  {!recording ? (
                    <Microphone size={20} />
                  ) : (
                    <>
                      <div className="absolute h-full w-full bg-gradient-to-tr from-indigo-500 to-indigo-300 animate-pulse -z-10"></div>
                      <MicrophoneStage size={20} />
                    </>
                  )}
                </Button>
              </Tooltip>
            }
          />
          <InteractiveAvatarTextInput
            label="ZoBot"
            aria-label="ZoBot"
            placeholder="Chat with the ZoBot"
            input={input}
            onSubmit={() => {
              setIsLoadingChat(true);
              if (!input) {
                setDebug("Please enter text to send to ZoBot");
                return;
              }
              handleSubmitToFlowise();
            }}
            setInput={setInput}
            disabled={!stream}
            loading={isLoadingChat}
            endContent={
              <Tooltip
                content={!recording ? "Start recording" : "Stop recording"}
              >
                <Button
                  onClick={!recording ? startRecording : stopRecording}
                  isDisabled={!stream}
                  isIconOnly
                  className={clsx(
                    "mr-4 text-white",
                    !recording
                      ? "bg-gradient-to-tr from-indigo-500 to-indigo-300"
                      : ""
                  )}
                  size="sm"
                  variant="shadow"
                >
                  {!recording ? (
                    <Microphone size={20} />
                  ) : (
                    <>
                      <div className="absolute h-full w-full bg-gradient-to-tr from-indigo-500 to-indigo-300 animate-pulse -z-10"></div>
                      <MicrophoneStage size={20} />
                    </>
                  )}
                </Button>
              </Tooltip>
            }
          />
        </CardFooter>
      </Card>
      <div className="flex flex-col gap-4">
        <p className="font-mono text-left">
          <span className="font-bold">Chat Session ID:</span>
          <br />
          {chatSessionId}
          {stream ? (
            <>
            <br />
            <span className="font-bold">HeyGen Session ID:</span>
            <br />
            {data?.sessionId}
            <br /></>
          ) : null}
        </p>
        <p className="font-mono text-right">
          <span className="font-bold">Console:</span>
          <br />
          {debug}
        </p>
      </div>
    </div>
  );
}
