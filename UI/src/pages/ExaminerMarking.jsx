import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  RotateCcw,
  Loader,
  Type,
  X,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Barcode,
  Check
} from "lucide-react";
import PDFAnnotator from "../components/PDFAnnotator";
import sectionService from "../services/sectionService";
import markingService from "../services/markingService";
import paperService from "../services/paperService";
import userService from "../services/userService";
import { useAuth } from "../context/AuthContext";
import message from "../services/messageService";

// Helper to extract landmarks from an image URL or base64
const extractImageLandmarks = async (imageSrc, landmarker) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const results = landmarker.detect(canvas);
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          resolve(results.faceLandmarks[0]);
        } else {
          resolve(null);
        }
      } catch (e) {
        console.error("Landmarker static detect error:", e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
};

// Helper to compare two sets of facial landmarks by calculating average Euclidean distance
const compareFaces = (face1, face2) => {
  if (!face1 || !face2 || face1.length === 0 || face2.length === 0) return 1.0;
  
  // Normalize face1 (registered)
  let minX1 = 1, maxX1 = 0, minY1 = 1, maxY1 = 0;
  for (const lm of face1) {
    if (lm.x < minX1) minX1 = lm.x;
    if (lm.x > maxX1) maxX1 = lm.x;
    if (lm.y < minY1) minY1 = lm.y;
    if (lm.y > maxY1) maxY1 = lm.y;
  }
  const w1 = maxX1 - minX1 || 1;
  const h1 = maxY1 - minY1 || 1;
  const cx1 = (minX1 + maxX1) / 2;
  const cy1 = (minY1 + maxY1) / 2;

  // Normalize face2 (live frame)
  let minX2 = 1, maxX2 = 0, minY2 = 1, maxY2 = 0;
  for (const lm of face2) {
    if (lm.x < minX2) minX2 = lm.x;
    if (lm.x > maxX2) maxX2 = lm.x;
    if (lm.y < minY2) minY2 = lm.y;
    if (lm.y > maxY2) maxY2 = lm.y;
  }
  const w2 = maxX2 - minX2 || 1;
  const h2 = maxY2 - minY2 || 1;
  const cx2 = (minX2 + maxX2) / 2;
  const cy2 = (minY2 + maxY2) / 2;

  // Compute mean distance between normalized coordinates
  let sumDist = 0;
  const len = Math.min(face1.length, face2.length);
  for (let i = 0; i < len; i++) {
    const nX1 = (face1[i].x - cx1) / w1;
    const nY1 = (face1[i].y - cy1) / h1;
    const nX2 = (face2[i].x - cx2) / w2;
    const nY2 = (face2[i].y - cy2) / h2;

    const dx = nX1 - nX2;
    const dy = nY1 - nY2;
    sumDist += Math.sqrt(dx * dx + dy * dy);
  }
  return sumDist / len;
};

const ExaminerMarking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Get parameters from location state or URL params (fallback to URL params on refresh)
  const queryParams = new URLSearchParams(location.search);
  const paperId = location.state?.paperId || queryParams.get('paperId');
  const scriptId = location.state?.scriptId || queryParams.get('scriptId');
  const allocationId = location.state?.allocationId || queryParams.get('allocationId');
  const examinerId = location.state?.examinerId || queryParams.get('examinerId') || user?.id;
  const studentName = location.state?.studentName || queryParams.get('studentName');
  const rollNo = location.state?.rollNo || queryParams.get('rollNo');
  const subject = location.state?.subject || queryParams.get('subject');
  const cleanPdfUrl = location.state?.cleanPdfUrl || queryParams.get('cleanPdfUrl');
  const rawQpPdfUrl = location.state?.questionPaperPdfUrl || queryParams.get('questionPaperPdfUrl');
  const isReadOnly = location.state?.readOnly === true || queryParams.get('readOnly') === 'true';
  const apiBaseUrl = import.meta.env.VITE_API_URL;
  const pdfUrl = scriptId ? `${apiBaseUrl}/Scripts/${scriptId}/pdf` : null;

  const [sections, setSections] = useState([]);
  const [paperInfo, setPaperInfo] = useState(null);
  const [fetchedQpUrl, setFetchedQpUrl] = useState("");
  const effectiveQpPdfUrl = rawQpPdfUrl || fetchedQpUrl || paperInfo?.questionPaperPdfUrl || paperInfo?.pdfUrl || "";

  const [expandedSections, setExpandedSections] = useState({});
  const [questionMarks, setQuestionMarks] = useState({});
  const [totalObtained, setTotalObtained] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [proctorWarning, setProctorWarning] = useState("");
  const landmarkerRef = useRef(null);
  const [isLandmarkerLoaded, setIsLandmarkerLoaded] = useState(false);
  const registeredLandmarksRef = useRef(null);
  const consecutiveMismatchesRef = useRef(0);
  const [sectionAttemptCounts, setSectionAttemptCounts] = useState({}); // Track attempted questions per section
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); 
  const [showQpModal, setShowQpModal] = useState(false);
  const [isQpCollapsed, setIsQpCollapsed] = useState(true);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const [isBlurred, setIsBlurred] = useState(false);
  const annotatorRef = useRef(null);

  // Security Print & Screenshot Prevention
  useEffect(() => {
    const handleContextMenu = (e) => {
      // Allow right-click on the PDF canvas or annotator container so examiners can allot marks
      if (
        e.target.tagName === 'CANVAS' || 
        e.target.closest('canvas') ||
        e.target.closest('[data-annotator-container="true"]')
      ) {
        return;
      }
      e.preventDefault();
    };

    const handleKeyDown = (e) => {
      // Ctrl+P or Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        message.warning("Printing is disabled on this secure marking page.");
        return;
      }
      // Ctrl+S or Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        return;
      }
      // F12 or Ctrl+Shift+I / Cmd+Opt+I
      if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
        return;
      }
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.key === 'PrtScn' || e.keyCode === 44) {
        e.preventDefault();
        
        // Show solid black security mask immediately to prevent OS screenshot capture
        const mask = document.getElementById("secure-screenshot-mask");
        if (mask) {
          mask.style.display = 'flex';
        }
        
        // Clear clipboard
        try {
          navigator.clipboard.writeText("");
        } catch (err) {}
        
        message.error("Screenshots are strictly prohibited on this secure marking page.");
        
        // Restore visibility after a delay
        setTimeout(() => {
          if (mask) {
            mask.style.display = 'none';
          }
        }, 1000);
        return;
      }
    };

    const handleKeyUp = (e) => {
      // PrintScreen key (in Chrome, PrintScreen triggers keyup but not keydown)
      if (e.key === 'PrintScreen' || e.key === 'PrtScn' || e.keyCode === 44) {
        e.preventDefault();
        
        // Show solid black security mask immediately to prevent OS screenshot capture
        const mask = document.getElementById("secure-screenshot-mask");
        if (mask) {
          mask.style.display = 'flex';
        }
        
        // Clear clipboard
        try {
          navigator.clipboard.writeText("");
        } catch (err) {}
        
        message.error("Screenshots are strictly prohibited on this secure marking page.");
        
        // Restore visibility after a delay
        setTimeout(() => {
          if (mask) {
            mask.style.display = 'none';
          }
        }, 1000);
      }
    };

    const handleCopy = (e) => {
      e.preventDefault();
      message.warning("Copying text is disabled for security reasons.");
    };

    const handleBlur = () => {
      setIsBlurred(true);
    };

    const handleFocus = () => {
      setIsBlurred(false);
      // Immediately wipe clipboard on refocus (in case an OS screenshot utility was opened)
      try {
        navigator.clipboard.writeText("");
      } catch (err) {}
    };

    const style = document.createElement("style");
    style.id = "secure-marking-print-block";
    style.innerHTML = `
      @media print {
        body {
          display: none !important;
        }
        html {
          display: none !important;
        }
      }
      .secure-marking-container {
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
      }
    `;
    document.head.appendChild(style);

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("cut", handleCopy);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      const printStyle = document.getElementById("secure-marking-print-block");
      if (printStyle) printStyle.remove();
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("cut", handleCopy);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const startWebcam = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.warn("Camera access denied or failed:", err);
      }
    };

    startWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [loading]);

  useEffect(() => {
    if (stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef.current]); 

  // Dynamic continuous proctoring facial matching
  useEffect(() => {
    if (loading || !stream) return;

    let intervalId = null;
    let localLandmarker = null;

    const setupProctoring = async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8"
        );
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        localLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "IMAGE",
          numFaces: 2
        });

        landmarkerRef.current = localLandmarker;
        setIsLandmarkerLoaded(true);

        let profileImageBase64 = sessionStorage.getItem("profileImage") || user?.profileImage;
        if (!profileImageBase64 && examinerId) {
          try {
            console.log(`OSM Proctoring: Profile image not found locally. Fetching details for user: ${examinerId}...`);
            const fetchedUser = await userService.getUserById(examinerId);
            if (fetchedUser && fetchedUser.profileImage) {
              profileImageBase64 = fetchedUser.profileImage;
              sessionStorage.setItem("profileImage", profileImageBase64);
              console.log("OSM Proctoring: Successfully fetched and cached profile image from DB.");
            } else {
              console.warn("OSM Proctoring: Fetched user does not have a profile image.");
            }
          } catch (e) {
            console.error("OSM Proctoring: Failed to fetch user profile image:", e);
          }
        }

        if (profileImageBase64) {
          console.log("OSM Proctoring: Profile image found. Extracting registered landmarks...");
          const landmarks = await extractImageLandmarks(profileImageBase64, localLandmarker);
          if (landmarks) {
            registeredLandmarksRef.current = landmarks;
            console.log("OSM Proctoring: Registered profile landmarks cached successfully!");
          } else {
            console.error("OSM Proctoring: Failed to extract landmarks from registered profile image.");
          }
        } else {
          console.error("OSM Proctoring: No registered profile image available in local storage, user context, or database!");
        }

        const runVerificationCheck = () => {
          if (!videoRef.current || !landmarkerRef.current) {
            console.log("OSM Proctoring check skipped: Video ref or landmarker not initialized.");
            return;
          }
          const video = videoRef.current;
          if (video.readyState < 2) {
            console.log("OSM Proctoring check skipped: Video is not ready yet.");
            return;
          }

          console.log("OSM Proctoring: Executing periodic face matching check...");

          try {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = 160;
            tempCanvas.height = 120;
            const ctx = tempCanvas.getContext("2d");
            if (!ctx) return;

            // Draw current video frame directly to canvas in standard orientation to match registered profile photo
            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

            const results = landmarkerRef.current.detect(tempCanvas);
            const facesCount = results.faceLandmarks ? results.faceLandmarks.length : 0;

            console.log(`OSM Proctoring: Detected ${facesCount} face(s) in frame.`);

            let currentCheckWarning = "";

            if (facesCount === 0) {
              currentCheckWarning = "No Face";
            } else if (facesCount > 1) {
              currentCheckWarning = "Multiple Faces";
            } else {
              const currentLandmarks = results.faceLandmarks[0];
              if (registeredLandmarksRef.current) {
                const distance = compareFaces(registeredLandmarksRef.current, currentLandmarks);
                console.log(`OSM Proctoring: Face match distance: ${distance.toFixed(4)} (Threshold: 0.15)`);
                
                if (distance > 0.15) {
                  currentCheckWarning = "Mismatch";
                }
              } else {
                console.warn("OSM Proctoring: Registered landmarks missing, defaulting to presence check.");
              }
            }

            if (currentCheckWarning !== "") {
              consecutiveMismatchesRef.current = (consecutiveMismatchesRef.current || 0) + 1;
              console.warn(`OSM Proctoring: Check failed (${currentCheckWarning}). Consecutive failures: ${consecutiveMismatchesRef.current}/3`);
              
              if (consecutiveMismatchesRef.current >= 3) {
                setProctorWarning((prevWarning) => {
                  if (prevWarning !== currentCheckWarning) {
                    return currentCheckWarning;
                  }
                  return prevWarning;
                });
              }
            } else {
              if (consecutiveMismatchesRef.current > 0) {
                console.log("OSM Proctoring: Verification succeeded, resetting failure counter.");
              }
              consecutiveMismatchesRef.current = 0;
              setProctorWarning("");
            }
          } catch (err) {
            console.error("OSM Proctoring Check Error:", err);
          }
        };

        // Trigger initial fast check after 4 seconds
        setTimeout(runVerificationCheck, 4000);

        // Run matching every 5 seconds
        intervalId = setInterval(runVerificationCheck, 5000);
      } catch (err) {
        console.error("OSM Proctoring Setup failed:", err);
      }
    };

    setupProctoring();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (localLandmarker) {
        try {
          localLandmarker.close();
        } catch (e) {}
      }
    };
  }, [loading, stream]); 
  useEffect(() => {
    if (!paperId) {
      setError('No paper selected. Please select a script from the Scripts page.');
      setLoading(false);
      return;
    }
    fetchPaperData();
  }, [paperId]);

  const loadExistingQuestionMarks = async (mId, defaultMarks) => {
    try {
      let marksToLoad = null;
      
      // 1. Try to fetch draft marks from Redis
      try {
        const draftRes = await markingService.getDraftMarks(scriptId, examinerId);
        if (draftRes && draftRes.draftData) {
          marksToLoad = draftRes.draftData;
        }
      } catch (e) {
        console.warn("Failed to load draft marks from Redis:", e);
      }

      // 2. If no draft, fetch saved marks from DB
      if (!marksToLoad) {
        const savedMarks = await markingService.getQuestionMarks(mId);
        if (savedMarks && savedMarks.length > 0) {
          // Convert array format to object format for state
          marksToLoad = { ...defaultMarks };
          savedMarks.forEach(sm => {
            if (marksToLoad[sm.questionId]) {
              marksToLoad[sm.questionId] = {
                ...marksToLoad[sm.questionId],
                marksAwarded: sm.marksAwarded,
                isSkipped: sm.isSkipped,
                remarks: sm.remarks || "",
                isAttempted: sm.isAttempted
              };
            }
          });
        }
      }

      // 3. Apply the loaded marks
      if (marksToLoad) {
        // Ensure default structure is maintained in case draft is partial
        const updated = { ...defaultMarks };
        Object.keys(marksToLoad).forEach(qId => {
          if (updated[qId]) {
             updated[qId] = { ...updated[qId], ...marksToLoad[qId] };
          }
        });
        setQuestionMarks(updated);
        calculateTotal(updated);
      }
    } catch (err) {
      console.error("Failed to load existing question marks:", err);
    }
  };

  const createMarkingSession = async () => {
    try {
      if (!allocationId || !examinerId) {
        setError('Missing allocation or examiner information');
        return;
      }

      // Create a new marking session (or retrieve existing)
      const markingResponse = await markingService.createMarking(
        allocationId,
        examinerId,
        0, // Initial total marks
        remarks
      );

      if (markingResponse && markingResponse.id) {
        setMarkingId(markingResponse.id);
        if (markingResponse.remarks) {
          setRemarks(markingResponse.remarks);
        }
        if (markingResponse.status === "submitted") {
          setSubmitted(true);
        }
        return markingResponse.id;
      }
    } catch (err) {
      console.error('Failed to create marking session:', err);
      setError('Failed to create marking session. Please try again.');
    }
  };

  const fetchPaperData = async () => {
    try {
      setLoading(true);
      // Fetch paper details to get questionPaperPdfUrl
      if (paperId) {
        try {
          const fullPaper = await paperService.getPaperById(paperId);
          if (fullPaper) {
            setPaperInfo(fullPaper);
            if (fullPaper.questionPaperPdfUrl) {
              setFetchedQpUrl(fullPaper.questionPaperPdfUrl);
            }
          }
        } catch (qpErr) {
          console.warn("Failed to fetch full paper by ID:", qpErr);
        }
      }

      // Use dynamic paperId instead of hardcoded 2
      const data = await sectionService.getAllSections(paperId);
      
      if (data && data.length > 0) {
        setSections(data);
        // Extract paper info from the first section's paper object if not already loaded
        if (data[0].paper) {
          setPaperInfo(prev => ({ ...(prev || {}), ...data[0].paper }));
          if (data[0].paper.questionPaperPdfUrl) {
            setFetchedQpUrl(data[0].paper.questionPaperPdfUrl);
          }
        }

        const expanded = {};
        const marks = {};
        const attemptCounts = {};
        
        data.forEach((section) => {
          expanded[section.id] = true; // All sections open by default
          attemptCounts[section.id] = 0; // Initialize attempt count for section
          section.questions?.forEach((q) => {
            marks[q.questionId] = {
              marksAwarded: 0,
              isSkipped: false,
              remarks: "",
              isAttempted: false,
              maxMarks: q.marks,
              questionNo: q.questionNo
            };
          });
        });
        
        setExpandedSections(expanded);
        setQuestionMarks(marks);
        setSectionAttemptCounts(attemptCounts);

        // Auto-select first question so annotation tool is immediately enabled
        const firstQ = data[0]?.questions?.[0];
        if (firstQ) {
          setSelectedQuestion((prev) => prev || firstQ.questionId);
        }

        // Create marking session after loading sections
        const mId = await createMarkingSession();
        if (mId) {
          await loadExistingQuestionMarks(mId, marks);
        }
      }
    } catch (err) {
      setError("Failed to fetch paper data. Please check connection.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnnotationsChange = (newAnnotations) => {
    setAnnotations(newAnnotations);
    
    // SYNC LOGIC: Map marks from annotations back to the question Palette
    setQuestionMarks(prev => {
      const updated = { ...prev };
      
      // Reset marks for all questions to recalculate from annotations
      Object.keys(updated).forEach(id => {
        updated[id].marksAwarded = 0;
        updated[id].isAttempted = false;
        updated[id].isSkipped = false;
      });

      // Sum marks from annotations for each question
      newAnnotations.forEach(anno => {
        if (anno.questionId && anno.marks !== undefined) {
          const q = findQuestionByNo(anno.questionId);
          if (q && updated[q.questionId]) {
            const section = sections.find(s => s.id === q.sectionId);
            
            // If question is marked as skipped, set the flag
            if (anno.isSkipped) {
              updated[q.questionId].isSkipped = true;
              updated[q.questionId].marksAwarded = 0;
              updated[q.questionId].isAttempted = false;
            } else {
              // Enforce maxQuestionsToAttempt restriction
              const currentMarks = updated[q.questionId];
              const isCurrentlyAttempted = currentMarks?.isAttempted || currentMarks?.marksAwarded > 0;
              const willAttempt = anno.marks > 0;
              
              if (willAttempt && !isCurrentlyAttempted && section && section.maxQuestionsToAttempt > 0) {
                const attemptedCount = section.questions?.filter(sq => {
                  const m = updated[sq.questionId];
                  return m?.isAttempted || m?.marksAwarded > 0;
                }).length || 0;
                
                if (attemptedCount >= section.maxQuestionsToAttempt) {
                  setError(`Cannot attempt more than ${section.maxQuestionsToAttempt} questions in ${section.name}. Capped marks at 0.`);
                  setTimeout(() => setError(''), 4000);
                  return;
                }
              }

              updated[q.questionId].marksAwarded += anno.marks;
              updated[q.questionId].isAttempted = true;
              
              // Cap at max marks for the question
              if (updated[q.questionId].marksAwarded > q.marks) {
                updated[q.questionId].marksAwarded = q.marks;
              }
            }
          }
        }
      });

      // Ensure section-wise total marks are not exceeded
      sections.forEach(sec => {
        let secSum = 0;
        const secQuestions = sec.questions || [];
        
        // Sum marks awarded for this section
        secQuestions.forEach(q => {
          if (updated[q.questionId]) {
            secSum += updated[q.questionId].marksAwarded || 0;
          }
        });

        if (secSum > sec.totalMarks) {
          let excess = secSum - sec.totalMarks;
          
          // Iterate backwards to reduce the excess from attempted questions
          for (let i = secQuestions.length - 1; i >= 0; i--) {
            const q = secQuestions[i];
            if (updated[q.questionId] && updated[q.questionId].marksAwarded > 0) {
              const currentVal = updated[q.questionId].marksAwarded;
              if (currentVal >= excess) {
                updated[q.questionId].marksAwarded = currentVal - excess;
                excess = 0;
                break;
              } else {
                updated[q.questionId].marksAwarded = 0;
                excess -= currentVal;
              }
            }
          }
          setError(`Marks in ${sec.name} capped to not cross section total of ${sec.totalMarks}.`);
          setTimeout(() => setError(''), 4000);
        }
      });

      calculateTotal(updated);
      return updated;
    });
  };

  const findQuestionByNo = (qNo) => {
    for (const section of sections) {
      const q = section.questions?.find((q) => String(q.questionNo) === String(qNo));
      if (q) return q;
    }
    return null;
  };

  const findQuestionById = (qId) => {
    if (!qId) return null;
    for (const section of sections) {
      const q = section.questions?.find((q) => String(q.questionId) === String(qId));
      if (q) return q;
    }
    return null;
  };

  const canAttemptQuestion = (qNo) => {
    const q = findQuestionByNo(qNo);
    if (!q) return true;
    const sec = sections.find(s => s.id === q.sectionId);
    if (!sec || !sec.maxQuestionsToAttempt || sec.maxQuestionsToAttempt <= 0) return true;
    
    // Check if question is already attempted
    const m = questionMarks[q.questionId];
    const isAlreadyAttempted = (m?.isAttempted || (m?.marksAwarded && m.marksAwarded > 0)) && !m?.isSkipped;
    if (isAlreadyAttempted) return true; // Can re-edit or update existing attempted question
    
    // Count currently attempted questions in this section
    const attemptedCount = (sec.questions || []).filter(sq => {
      const sm = questionMarks[sq.questionId];
      return (sm?.isAttempted || (sm?.marksAwarded && sm.marksAwarded > 0)) && !sm?.isSkipped;
    }).length;
    
    return attemptedCount < sec.maxQuestionsToAttempt;
  };

  const calculateTotal = (marks) => {
    let total = 0;
    Object.values(marks).forEach((mark) => {
      if (!mark.isSkipped) {
        total += mark.marksAwarded || 0;
      }
    });
    setTotalObtained(total);
  };

  const getSectionMarks = (sectionId) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return 0;

    return section.questions?.reduce((sum, q) => {
      const mark = questionMarks[q.questionId];
      return sum + (mark && !mark.isSkipped ? mark.marksAwarded || 0 : 0);
    }, 0) || 0;
  };

  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleMarkChange = (questionId, value) => {
    const question = findQuestionById(questionId);
    if (!question) return;

    let numValue = Math.max(0, Math.min(value, question.marks));
    
    // Find the section this question belongs to
    const section = sections.find(s => s.id === question.sectionId);
    if (!section) return;

    // Calculate current section total excluding this question
    const sectionOtherQuestionsTotal = section.questions?.reduce((sum, q) => {
      if (q.questionId === questionId) return sum;
      const mark = questionMarks[q.questionId];
      return sum + (mark && !mark.isSkipped ? mark.marksAwarded || 0 : 0);
    }, 0) || 0;

    if (sectionOtherQuestionsTotal + numValue > section.totalMarks) {
      numValue = Math.max(0, section.totalMarks - sectionOtherQuestionsTotal);
      setError(`Marks in ${section.name} cannot exceed section total of ${section.totalMarks}. Capped marks at ${numValue}.`);
      setTimeout(() => setError(''), 4000);
    }

    // Check if marking this question would exceed maxQuestionsToAttempt
    const currentMarks = questionMarks[questionId];
    const isCurrentlyAttempted = currentMarks?.isAttempted || currentMarks?.marksAwarded > 0;
    const isNewAttempt = numValue > 0 && !isCurrentlyAttempted;

    if (isNewAttempt && section.maxQuestionsToAttempt > 0) {
      // Count how many questions in this section are already attempted
      const attemptedCount = section.questions?.filter(q => {
        const marks = questionMarks[q.questionId];
        return marks?.isAttempted || marks?.marksAwarded > 0;
      }).length || 0;

      if (attemptedCount >= section.maxQuestionsToAttempt) {
        setError(`Cannot mark more than ${section.maxQuestionsToAttempt} questions in ${section.name}. Capped marks at 0.`);
        setTimeout(() => setError(''), 3000);
        numValue = 0;
      }
    }

    setQuestionMarks((prev) => {
      const updated = {
        ...prev,
        [questionId]: {
          ...prev[questionId],
          marksAwarded: numValue,
          isAttempted: value !== "" && !isNaN(value),
        },
      };
      calculateTotal(updated);
      
      // Sync marks from right panel directly back into the annotations
      if (scriptId) {
        const saved = sessionStorage.getItem(`annotations_${scriptId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const updatedAnnos = parsed.map(anno => {
              if (anno.questionId === question.questionNo) {
                return {
                  ...anno,
                  marks: numValue,
                  type: numValue > 0 ? 'tick' : 'cross',
                  color: numValue > 0 ? '#00AA00' : '#FF0000'
                };
              }
              return anno;
            });
            sessionStorage.setItem(`annotations_${scriptId}`, JSON.stringify(updatedAnnos));
            
            // Trigger instant sync to redraw the canvas
            annotatorRef.current?.syncAnnotations();
          } catch (e) {
            console.error("Error syncing right panel change with annotations:", e);
          }
        }
      }

      return updated;
    });
  };

  const handleSkipQuestion = (questionId) => {
    setQuestionMarks((prev) => {
      const updated = {
        ...prev,
        [questionId]: {
          ...prev[questionId],
          isSkipped: !prev[questionId]?.isSkipped,
          marksAwarded: !prev[questionId]?.isSkipped ? 0 : prev[questionId]?.marksAwarded,
        },
      };
      calculateTotal(updated);
      return updated;
    });
  };

  const handleNextQuestion = () => {
    if (!selectedQuestion) return;
    
    // Find flat list of all questions to find the next one
    const allQuestions = sections.flatMap(s => s.questions || []);
    const currentIndex = allQuestions.findIndex(q => q.questionId === selectedQuestion);
    
    if (currentIndex !== -1 && currentIndex < allQuestions.length - 1) {
      setSelectedQuestion(allQuestions[currentIndex + 1].questionId);
    }
  };

  const buildQuestionMarksPayload = () => {
    return Object.entries(questionMarks).map(([qId, mark]) => {
      const questionId = parseInt(qId);
      const question = findQuestionById(questionId);
      const section = question ? sections.find(s => s.id === question.sectionId) : null;
      
      // Check if this section has a maximum attempt limit and we have reached it
      let limitReached = false;
      if (section && section.maxQuestionsToAttempt > 0) {
        const attemptedCount = section.questions?.filter(q => {
          const m = questionMarks[q.questionId];
          return m && (m.isAttempted || m.marksAwarded > 0);
        }).length || 0;
        
        limitReached = attemptedCount >= section.maxQuestionsToAttempt;
      }

      const isAttempted = mark.isAttempted || mark.marksAwarded > 0;
      // Auto skip if the question is unattempted AND the section's maximum attempt limit is reached
      const isSkipped = mark.isSkipped || (!isAttempted && limitReached);

      return {
        questionId: questionId,
        questionNo: mark.questionNo,
        marksAwarded: mark.marksAwarded || 0,
        isSkipped: isSkipped,
        isAttempted: isAttempted,
        remarks: mark.remarks || "",
      };
    });
  };

  const showStatus = (type, msg) => {
    setSaveStatus({ type, msg });
    setTimeout(() => setSaveStatus(null), 3500);
  };

  // Auto-save draft marks
  useEffect(() => {
    if (!loading && !submitted && Object.keys(questionMarks).length > 0) {
      const timer = setTimeout(async () => {
        try {
          await markingService.saveDraftMarks(scriptId, examinerId, questionMarks);
        } catch (err) {
          console.warn("Failed to auto-save draft marks:", err);
        }
      }, 1500); // 1.5 second debounce

      return () => clearTimeout(timer);
    }
  }, [questionMarks, loading, submitted, scriptId, examinerId]);

  const handleSaveMarks = async () => {
    if (!markingId) {
      showStatus("error", "No active marking session. Cannot persist marks.");
      return;
    }
    try {
      setSaving(true);
      
      // Compile evaluated PDF copy with annotations intact and upload
      let evaluatedUrl = "";
      if (annotatorRef.current?.generateEvaluatedPdf) {
        evaluatedUrl = await annotatorRef.current.generateEvaluatedPdf(markingId);
      }

      // Persist draft total, remarks and evaluated copy path
      await markingService.updateMarking(markingId, totalObtained, remarks, evaluatedUrl);
      
      const payload = buildQuestionMarksPayload();
      await markingService.saveQuestionMarks(markingId, payload);
      showStatus("success", "Draft saved — marks & evaluated PDF stored successfully.");
    } catch (err) {
      showStatus("error", "Error saving marks: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };
 
  const handleSubmitMarking = async () => {
    const totalPages = annotatorRef.current?.getTotalPages ? annotatorRef.current.getTotalPages() : 0;

    // Page coverage check: skip page 1 (index 0), all other pages must have at least one annotation
    if (totalPages > 1) {
      const unmarkedPages = [];
      for (let p = 1; p < totalPages; p++) { // start from index 1 = Page 2
        const hasPageMarking = annotations.some(anno => (anno.page === undefined ? 0 : anno.page) === p);
        if (!hasPageMarking) {
          unmarkedPages.push(p + 1); // display as 1-indexed page number
        }
      }
      if (unmarkedPages.length > 0) {
        showStatus(
          'error',
          `All pages (except Page 1) must have a marking before submitting! Unannotated page(s): ${unmarkedPages.map(n => `Page ${n}`).join(', ')}`
        );
        return;
      }
    }

    // Section-wise question attempt check considering MaxQuestionsToAttempt
    const pendingSectionRequirements = [];

    sections.forEach(sec => {
      const secQuestions = sec.questions || [];
      const attemptedCount = secQuestions.filter(q => {
        const m = questionMarks[q.questionId];
        return m && (m.isAttempted || (m.marksAwarded && m.marksAwarded > 0)) && !m.isSkipped;
      }).length;

      if (sec.maxQuestionsToAttempt > 0) {
        // If candidate attempted maxQuestionsToAttempt (e.g. 3 in Section C), section is satisfied!
        if (attemptedCount >= sec.maxQuestionsToAttempt) {
          return;
        }

        const unreviewedQuestions = secQuestions.filter(q => {
          const m = questionMarks[q.questionId];
          if (!m) return true;
          return !m.isAttempted && !(m.marksAwarded > 0) && !m.isSkipped;
        });

        if (unreviewedQuestions.length > 0) {
          pendingSectionRequirements.push(
            `${sec.name} (${attemptedCount}/${sec.maxQuestionsToAttempt} attempted, pending: ${unreviewedQuestions.map(q => `Q${q.questionNo}`).join(', ')})`
          );
        }
      } else {
        const unreviewedQuestions = secQuestions
          .filter(q => !q.isOptional)
          .filter(q => {
            const m = questionMarks[q.questionId];
            if (!m) return true;
            return !m.isAttempted && !(m.marksAwarded > 0) && !m.isSkipped;
          });

        if (unreviewedQuestions.length > 0) {
          pendingSectionRequirements.push(
            `${sec.name} pending: ${unreviewedQuestions.map(q => `Q${q.questionNo}`).join(', ')}`
          );
        }
      }
    });

    if (pendingSectionRequirements.length > 0) {
      showStatus(
        'error',
        `All section requirements must be completed before submitting: ${pendingSectionRequirements.join('; ')}`
      );
      return;
    }

    if (!markingId) {
      showStatus('error', 'No active marking session. Cannot submit.');
      return;
    }
 
    try {
      setSaving(true);
      
      // Compile evaluated PDF copy with annotations intact and upload
      let evaluatedUrl = '';
      if (annotatorRef.current?.generateEvaluatedPdf) {
        evaluatedUrl = await annotatorRef.current.generateEvaluatedPdf(markingId);
      }

      // Persist final marks, remarks, and evaluated copy path
      await markingService.updateMarking(markingId, totalObtained, remarks, evaluatedUrl);

      // Save question marks
      const payload = buildQuestionMarksPayload();
      await markingService.saveQuestionMarks(markingId, payload);
      
      // Submit the marking
      await markingService.submitMarking(markingId);
      setSubmitted(true);
      showStatus('success', `Submitted! Total: ${totalObtained} / ${paperInfo?.maxMarks || 100}`);
    } catch (err) {
      showStatus('error', 'Submission failed: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };


  const totalQuestionsCount = Object.keys(questionMarks).length;
  const allQuestionsDefined = totalQuestionsCount > 0;

  // Calculate total pages from annotatorRef (safe fallback: if no PDF loaded, treat as 0 pages)
  const totalAnnotatorPages = annotatorRef.current?.getTotalPages ? annotatorRef.current.getTotalPages() : 0;

  // Check pages from index 1 onwards (skip page 1 = index 0) for annotation coverage
  const unmarkedPageNumbers = totalAnnotatorPages > 1
    ? Array.from({ length: totalAnnotatorPages - 1 }, (_, i) => i + 1) // indices 1, 2, 3...
        .filter(p => !annotations.some(anno => (anno.page === undefined ? 0 : anno.page) === p))
        .map(p => p + 1) // convert to 1-indexed for display (index 1 → "Page 2", etc.)
    : [];

  // All pages (except page 1) must have at least one annotation
  const allPagesAnnotated = totalAnnotatorPages <= 1 || unmarkedPageNumbers.length === 0;

  // Section-wise attempt validation considering MaxQuestionsToAttempt
  const pendingSectionRequirements = [];

  sections.forEach(sec => {
    const secQuestions = sec.questions || [];
    const attemptedCount = secQuestions.filter(q => {
      const m = questionMarks[q.questionId];
      return m && (m.isAttempted || (m.marksAwarded && m.marksAwarded > 0)) && !m.isSkipped;
    }).length;

    if (sec.maxQuestionsToAttempt > 0) {
      // If candidate attempted maxQuestionsToAttempt (e.g. 3 in Section C), section is complete!
      if (attemptedCount >= sec.maxQuestionsToAttempt) {
        return;
      }

      const unreviewedQuestions = secQuestions.filter(q => {
        const m = questionMarks[q.questionId];
        if (!m) return true;
        return !m.isAttempted && !(m.marksAwarded > 0) && !m.isSkipped;
      });

      if (unreviewedQuestions.length > 0) {
        pendingSectionRequirements.push(
          `${sec.name}: ${attemptedCount}/${sec.maxQuestionsToAttempt} attempted (${unreviewedQuestions.map(q => `Q${q.questionNo}`).join(', ')} pending)`
        );
      }
    } else {
      const unreviewedQuestions = secQuestions
        .filter(q => !q.isOptional)
        .filter(q => {
          const m = questionMarks[q.questionId];
          if (!m) return true;
          return !m.isAttempted && !(m.marksAwarded > 0) && !m.isSkipped;
        });

      if (unreviewedQuestions.length > 0) {
        pendingSectionRequirements.push(
          `${sec.name} pending: ${unreviewedQuestions.map(q => `Q${q.questionNo}`).join(', ')}`
        );
      }
    }
  });

  const allSectionsSatisfied = pendingSectionRequirements.length === 0;

  // Build tooltip reason — show the most blocking reason first
  const submitDisabledReason = !allSectionsSatisfied
    ? `Section requirements pending before submitting: ${pendingSectionRequirements.join('; ')}`
    : !allPagesAnnotated
    ? `All pages (except Page 1) must have at least one annotation before submitting. Unannotated page(s): ${unmarkedPageNumbers.map(n => `Page ${n}`).join(', ')}`
    : saving
    ? 'Saving in progress...'
    : isReadOnly
    ? 'This submission is read-only'
    : '';

  const isSubmitDisabled = isReadOnly || saving || !allPagesAnnotated || !allSectionsSatisfied;


  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader className="w-12 h-12 text-teal-700 animate-spin mb-4" />
        <p className="text-gray-600 font-bold animate-pulse">Initializing Marking Interface...</p>
      </div>
    );
  }

  if (error && !sections.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
        <p className="text-gray-600 font-bold text-center mb-6">{error}</p>
        <button
          onClick={() => navigate('/scripts')}
          className="py-2 bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors md:px-6 px-4"
        >
          Back to Scripts
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 h-[100dvh] flex flex-col overflow-hidden secure-marking-container relative">
      {/* SECURITY BLUR OVERLAY */}
      {isBlurred && (
        <div className="absolute inset-0 bg-gray-900/90 z-[9999] flex flex-col items-center justify-center text-center select-none pointer-events-auto p-4 md:p-6">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-500 mb-6 shadow-lg animate-pulse">
            <AlertCircle size={44} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Screen Capture Protection Active</h2>
          <p className="text-gray-450 text-sm max-w-md font-semibold leading-relaxed">
            Screenshots and window switching are strictly restricted. Please refocus your browser window to resume marking.
          </p>
        </div>
      )}

      {/* SCREENSHOT KEY OPAQUE OVERLAY */}
      <div 
        id="secure-screenshot-mask" 
        className="fixed inset-0 bg-gray-950 z-[99999] hidden flex-col items-center justify-center text-center select-none pointer-events-auto p-4 md:p-6"
      >
        <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-500 mb-6 shadow-lg animate-pulse">
          <AlertCircle size={44} />
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Screen Capture Prohibited</h2>
        <p className="text-gray-400 text-sm max-w-md font-medium leading-relaxed">
          The PrintScreen key is disabled. Screen captures are strictly prohibited on this secure marking page.
        </p>
      </div>

      {/* HEADER */}
      <header className="bg-white text-gray-900 shadow-md py-1 flex justify-between items-center z-50 border-b border-gray-200 md:px-6 px-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate('/scripts')}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Scripts"
          >
            <ChevronLeft className="text-gray-600" size={24} />
          </button>
          
          <div className="border-r border-gray-300 pr-6">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              OSM <span className="text-teal-700">Marking</span>
            </h1>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Answer Sheet Evaluation</p>
          </div>

          <div className="hidden md:block bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">
            <p className="text-[10px] uppercase font-bold text-gray-500">Paper</p>
            <p className="font-semibold text-xs text-gray-900">
              {paperInfo?.paperName || "Paper"} <span className="text-gray-400">({paperInfo?.paperCode || ""})</span>
            </p>
          </div>

          <div className="hidden md:block bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">
            <p className="text-[10px] uppercase font-bold text-gray-500">Max Marks</p>
            <p className="font-bold text-sm text-gray-900">{paperInfo?.maxMarks || "100"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!effectiveQpPdfUrl) {
                message.info("Question paper PDF is not available for this paper.");
                return;
              }
              setIsQpCollapsed(!isQpCollapsed);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all shadow-sm cursor-pointer ${
              !isQpCollapsed && effectiveQpPdfUrl
                ? 'bg-teal-700 text-white border-teal-800 hover:bg-teal-800' 
                : 'bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100'
            }`}
            title={!isQpCollapsed && effectiveQpPdfUrl ? "Hide Question Paper" : "Show Question Paper"}
          >
            <FileText size={14} className={!isQpCollapsed && effectiveQpPdfUrl ? "text-white" : "text-teal-600"} />
            <span>{!isQpCollapsed && effectiveQpPdfUrl ? "Hide QP" : "Show QP"}</span>
          </button>

          <div className="bg-teal-50 py-1.5 rounded-lg border border-teal-200 flex flex-col items-center md:px-4 px-3">
            <p className="text-[10px] uppercase font-bold text-teal-700">Total Score</p>
            <p className="text-2xl font-bold text-teal-900 leading-none">
              {totalObtained.toFixed(1)} <span className="text-xs font-normal text-teal-700">/ {paperInfo?.maxMarks || 100}</span>
            </p>
          </div>
          
          <button
            onClick={!isSubmitDisabled ? handleSubmitMarking : undefined}
            disabled={isSubmitDisabled}
            className={`py-2 rounded-md font-bold uppercase text-xs transition-colors shadow-md md:px-5 px-4 ${
              isSubmitDisabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
            }`}
            title={submitDisabledReason || 'Submit evaluation'}
          >
            {saving ? 'Saving...' : (submitted ? 'Re-submit' : 'Submit')}
          </button>
        </div>
      </header>

      {/* PROCTOR WARNING BANNER */}
      {proctorWarning && (
        <div className="bg-red-600 text-white text-xs font-bold py-2.5 flex items-center justify-between border-b border-red-700 animate-pulse select-none z-50 shrink-0 md:px-6 px-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>
              <strong>PROCTOR ALERT:</strong> {
                proctorWarning === "No Face"
                  ? "No face detected in the live camera feed. Please ensure your face is fully visible and looking at the screen."
                  : proctorWarning === "Multiple Faces"
                  ? "Multiple people detected in frame. Proctoring rules permit only the assigned examiner to mark papers."
                  : "Identity verification mismatch. The person in front of the camera does not match the registered profile picture."
              }
            </span>
          </div>
          <span className="text-[10px] bg-red-700/80 px-2 py-0.5 rounded border border-red-500/20 uppercase font-extrabold tracking-wider">Action Required</span>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 p-3 flex flex-row gap-3 overflow-hidden relative">
        
        {/* QUESTION PAPER (LEFT) */}
        {effectiveQpPdfUrl && !isQpCollapsed && (
          <section className="w-80 shrink-0 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col transition-all">
            <div className="bg-gray-900 text-white px-3 py-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-teal-400" />
                <h3 className="font-semibold text-xs uppercase tracking-wide">Question Paper</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsQpCollapsed(true)}
                className="p-1 hover:bg-gray-800 text-gray-300 hover:text-white rounded transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                title="Collapse Question Paper"
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline">Collapse</span>
              </button>
            </div>
            <div className="flex-1 bg-gray-100">
              <iframe 
                src={
                  effectiveQpPdfUrl.startsWith('http')
                    ? effectiveQpPdfUrl
                    : `${import.meta.env.VITE_API_URL.replace('/api', '')}/${effectiveQpPdfUrl.replace(/^\//, '')}`
                }
                className="w-full h-full border-0"
                title="Question Paper"
              />
            </div>
          </section>
        )}

        {/* MID: ANNOTATOR AREA */}
        <section className="flex-1 relative bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col min-w-0 transition-all">
          <PDFAnnotator 
            ref={annotatorRef}
            onAnnotationsChange={handleAnnotationsChange}
            currentQuestionId={selectedQuestion ? findQuestionById(selectedQuestion)?.questionNo : null}
            maxMarks={selectedQuestion ? findQuestionById(selectedQuestion)?.marks : 0}
            onNextQuestion={handleNextQuestion}
            sections={sections}
            pdfUrl={pdfUrl}
            scriptId={scriptId}
            readOnly={isReadOnly}
            canAttemptQuestion={canAttemptQuestion}
            onToggleQp={() => {
              if (!effectiveQpPdfUrl) {
                message.info("Question paper PDF is not available for this paper.");
                return;
              }
              setIsQpCollapsed(!isQpCollapsed);
            }}
            isQpOpen={!isQpCollapsed && !!effectiveQpPdfUrl}
          />
        </section>

        {/* RIGHT: MARKING PANEL */}
        <aside className="w-56 shrink-0 flex flex-col gap-2.5 max-h-full self-start overflow-hidden">
          {/* CONTROL CENTER */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="grid gap-2 grid-cols-2">
              <button 
                onClick={handleSaveMarks}
                disabled={isReadOnly}
                className="flex items-center justify-center gap-1.5 bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:bg-gray-100 disabled:text-gray-400 font-semibold py-2 rounded-md shadow-sm transition-colors text-xs uppercase disabled:cursor-not-allowed cursor-pointer"
              >
                <Save size={15} /> Save
              </button>
              <button 
                onClick={() => {if(window.confirm("Reset all marks?")) window.location.reload();}}
                disabled={isReadOnly}
                className="flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 font-semibold py-2 rounded-md shadow-sm transition-colors text-xs uppercase disabled:cursor-not-allowed cursor-pointer"
              >
                <RotateCcw size={15} /> Reset
              </button>
            </div>
          </div>

          {/* QUESTION PALETTE - FULL HEIGHT */}
          <div className="bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden shadow-md flex-1 min-h-0">
            <div className="bg-gray-900 text-white px-3 py-2 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <FileText size={14} className="text-teal-400" />
                <h3 className="font-semibold text-xs uppercase tracking-wide">Questions</h3>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-medium uppercase text-gray-300">Active</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50 space-y-2">
              {sections.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-3">
                  <AlertCircle size={30} className="mb-1.5 opacity-30" />
                  <p className="text-[11px] font-medium uppercase">No sections loaded</p>
                </div>
              )}

              {sections.map((sec) => {
                const attemptedCount = sec.questions?.filter(q => {
                  const marks = questionMarks[q.questionId];
                  return (marks?.isAttempted || (marks?.marksAwarded && marks.marksAwarded > 0)) && !marks?.isSkipped;
                }).length || 0;
                const isSectionComplete = sec.maxQuestionsToAttempt > 0 
                  ? attemptedCount >= sec.maxQuestionsToAttempt 
                  : attemptedCount === (sec.questions?.length || 0);

                return (
                <div key={sec.id} className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
                  <div 
                    onClick={() => toggleSection(sec.id)}
                    className="flex justify-between items-center bg-gray-100 px-2.5 py-1.5 border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                  >
                    <div className="flex-1">
                      <span className="font-bold text-[11px] text-gray-900 uppercase">{sec.name}</span>
                      {sec.maxQuestionsToAttempt > 0 ? (
                        <p className={`text-[9px] font-semibold leading-none mt-0.5 ${
                          attemptedCount >= sec.maxQuestionsToAttempt ? 'text-green-700' : 'text-gray-500'
                        }`}>
                          Attempts: {attemptedCount}/{sec.maxQuestionsToAttempt} {attemptedCount >= sec.maxQuestionsToAttempt ? '✓ (Max Reached)' : ''}
                        </p>
                      ) : (
                        <p className="text-[9px] text-gray-500 leading-none mt-0.5">
                          Attempted: {attemptedCount}/{sec.questions?.length || 0}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                        {getSectionMarks(sec.id)} / {sec.totalMarks}
                      </span>
                      {expandedSections[sec.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  </div>

                  {expandedSections[sec.id] && (
                    <div className="p-1.5 grid grid-cols-5 gap-1 bg-white">
                      {sec.questions?.map((q) => {
                        const m = questionMarks[q.questionId] || {};
                        const isSelected = selectedQuestion === q.questionId;
                        const isSkipped = m.isSkipped === true;
                        // Green (visited) = has marks OR is skipped
                        const hasMarks = Number(m.marksAwarded) > 0 || isSkipped;
                        const displayMark = m.marksAwarded !== undefined ? m.marksAwarded : 0;
                        const isSectionMaxMet = sec.maxQuestionsToAttempt > 0 && attemptedCount >= sec.maxQuestionsToAttempt && !hasMarks;
                        
                        return (
                          <div 
                            key={q.questionId}
                            onClick={() => {
                              setSelectedQuestion(q.questionId);
                              // Open annotator mark allotment popup (same as right click)
                              annotatorRef.current?.openMarkModalForQuestion?.(q.questionNo);
                            }}
                            className={`relative h-11 flex flex-col items-center justify-center rounded cursor-pointer transition-all border ${
                              isSelected 
                                ? (hasMarks 
                                    ? "bg-green-700 text-white border-green-800 ring-2 ring-green-400 font-bold z-10 scale-105 shadow-sm" 
                                    : "bg-red-700 text-white border-red-800 ring-2 ring-red-400 font-bold z-10 scale-105 shadow-sm")
                                : (hasMarks
                                    ? "bg-green-50 border-green-300 text-green-900 hover:bg-green-100 font-semibold"
                                    : isSectionMaxMet
                                    ? "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200 font-normal opacity-75"
                                    : "bg-red-50 border-red-300 text-red-900 hover:bg-red-100 font-semibold")
                            }`}
                            title={`Q${q.questionNo}: ${
                              isSkipped
                                ? 'Marked as Skipped'
                                : hasMarks
                                ? `${displayMark} marks`
                                : isSectionMaxMet
                                ? `Optional (Section limit ${sec.maxQuestionsToAttempt} reached)`
                                : '0 marks'
                            } (Click to open mark allotment box)`}
                          >
                            <span className="font-bold text-[11px] leading-tight">{q.questionNo}</span>
                            <span className={`text-[8.5px] font-bold leading-tight mt-0.5 ${
                              isSelected ? 'text-white' : (hasMarks ? 'text-green-800' : isSectionMaxMet ? 'text-gray-500' : 'text-red-700')
                            }`}>
                              {isSkipped ? 'Skip' : isSectionMaxMet ? 'Opt' : `${displayMark}m`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          </div>

          {/* REMARKS BUTTON DOWN IT */}
          <div className="shrink-0">
            <button
              onClick={() => setShowRemarksModal(true)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-white border border-gray-300 hover:border-teal-500 rounded-lg shadow-xs text-xs font-semibold text-gray-700 hover:bg-teal-50 hover:text-teal-900 transition-all cursor-pointer"
              title="Add or edit examiner remarks"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Type size={13} className="text-teal-600 shrink-0" />
                <span className="truncate text-[11px]">{remarks ? `Remarks: "${remarks.slice(0, 16)}..."` : "Add Remarks"}</span>
              </div>
              <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 shrink-0 uppercase font-bold">
                {remarks ? "Edit" : "+"}
              </span>
            </button>
          </div>
        </aside>
      </main>

      {/* REMARKS MODAL */}
      {showRemarksModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-150 overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Type size={16} className="text-teal-400" />
                <h3 className="font-bold text-sm uppercase tracking-wide">Examiner Remarks</h3>
              </div>
              <button 
                onClick={() => setShowRemarksModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-600">Provide overall feedback or observations for this answer script:</p>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter feedback or examiner observations..."
                className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-sm font-medium focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                rows="4"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowRemarksModal(false)}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                >
                  Save Remarks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATUS TOAST */}
      {saveStatus && (
        <div className={`fixed bottom-6 right-6 px-6 py-2.5 rounded-lg shadow-lg font-semibold flex items-center gap-3 animate-in slide-in-from-bottom duration-300 ${
          saveStatus.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {saveStatus.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p>{saveStatus.msg}</p>
        </div>
      )}

      {/* ERROR FEEDBACK */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white py-2.5 rounded-lg shadow-lg font-semibold flex items-center gap-3 animate-in slide-in-from-bottom duration-300 md:px-6 px-4">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}
      {/* LIVE CAMERA CAPTURE PIP */}
      <div className={`fixed bottom-6 left-6 z-40 bg-gray-900 border-2 ${proctorWarning ? 'border-red-600 animate-pulse scale-105 shadow-red-500/40' : 'border-teal-500 shadow-teal-500/10'} rounded-xl overflow-hidden shadow-2xl w-44 h-32 flex flex-col group hover:scale-105 transition-all`}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover bg-gray-800"
          style={{ transform: 'scaleX(-1)' }}
        />
        <div className={`absolute top-2 left-2 ${proctorWarning ? 'bg-red-600/90' : 'bg-teal-700/90'} text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm`}>
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
          {proctorWarning ? "PROCTOR ALERT" : "PROCTOR ACTIVE"}
        </div>
        
        {/* Semi-transparent Backdrop Warning on PIP Window */}
        {proctorWarning && (
          <div className="absolute inset-0 bg-red-950/90 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center select-none animate-fade-in z-20">
            <span className="text-lg">⚠️</span>
            <h4 className="font-extrabold text-red-200 text-[10px] leading-tight mt-1 uppercase tracking-wider">
              {proctorWarning === "No Face" 
                ? "No Face" 
                : proctorWarning === "Multiple Faces"
                ? "Multiple People!"
                : "Mismatch!"}
            </h4>
            <p className="text-[8px] text-red-300 mt-0.5 leading-tight">
              {proctorWarning === "No Face"
                ? "Please look at camera feed."
                : proctorWarning === "Multiple Faces"
                ? "Only one person permitted."
                : "Identity does not match."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExaminerMarking;

