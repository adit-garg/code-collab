import { useParams, useNavigate } from "react-router-dom";
import { useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SocketContext } from '../contexts/SocketContext';
import { CodeContext } from '../contexts/CodeContext';
import Editor, { useMonaco } from "@monaco-editor/react";
import '../App.css';

function GetCode() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { socket, setRoomId, isConnected, setIsConnected } = useContext(SocketContext);
    const {
        langs, stdin, setStdin, stdout, setStdout, code, setCode,
        stderr, setStderr, flags, setFlags, stdinActive, setStdinActive,
        langId, stdoutActive, setStdoutActive
    } = useContext(CodeContext);

    const monaco = useMonaco();
    const [editor, setEditor] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('Connecting...');
    const [isCodeChangedBySocket, setIsCodeChangedBySocket] = useState(false);
    
    // Enhanced state for handling multiple cursors
    const [decorations, setDecorations] = useState([]);
    const [userCursors, setUserCursors] = useState(new Map());
    const [connectedUsers, setConnectedUsers] = useState(new Set());
    const currentUserId = useRef(null);
    const currentUserColor = useRef(null);
    const currentUserAnimal = useRef(null);

    // Debouncing and throttling refs
    const lastCodeChangeTime = useRef(0);
    const lastCursorMoveTime = useRef(0);
    const codeChangeDebounceTimer = useRef(null);
    const cursorMoveThrottleTimer = useRef(null);

    // Prevent infinite loops during remote updates
    const isApplyingRemoteChange = useRef(false);

    // Store the current cursor position before applying remote changes
    const currentCursorPosition = useRef(null);

    // Colors for different users (more vibrant colors)
    const userColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#FF8A80', '#80CBC4', '#81C784', '#FFB74D', '#F8BBD9'
    ];

    // Animal names for user labels (like Google Docs)
    const animalNames = [
        'Panda', 'Tiger', 'Lion', 'Elephant', 'Giraffe', 'Zebra', 'Koala', 'Kangaroo',
        'Penguin', 'Dolphin', 'Whale', 'Shark', 'Octopus', 'Jellyfish', 'Seahorse', 'Starfish',
        'Eagle', 'Falcon', 'Owl', 'Parrot', 'Flamingo', 'Peacock', 'Swan', 'Hummingbird',
        'Fox', 'Wolf', 'Bear', 'Rabbit', 'Squirrel', 'Deer', 'Moose', 'Raccoon',
        'Butterfly', 'Dragonfly', 'Ladybug', 'Bee', 'Ant', 'Spider', 'Gecko', 'Chameleon',
        'Unicorn', 'Dragon', 'Phoenix', 'Griffin', 'Pegasus', 'Sphinx', 'Kraken', 'Yeti',
        'Cheetah', 'Leopard', 'Jaguar', 'Lynx', 'Bobcat', 'Cougar', 'Panther', 'Ocelot',
        'Hippo', 'Rhino', 'Bison', 'Buffalo', 'Yak', 'Llama', 'Alpaca', 'Camel',
        'Turtle', 'Tortoise', 'Iguana', 'Komodo', 'Anaconda', 'Python', 'Cobra', 'Viper',
        'Monkey', 'Gorilla', 'Orangutan', 'Chimpanzee', 'Lemur', 'Sloth', 'Armadillo', 'Anteater'
    ];

    // Generate consistent color for user
    const getUserColor = useCallback((userId) => {
        const hash = userId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return userColors[Math.abs(hash) % userColors.length];
    }, []);

    // Generate consistent animal name for user
    const getUserAnimal = useCallback((userId) => {
        const hash = userId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return animalNames[Math.abs(hash) % animalNames.length];
    }, []);

    // Copy room link to clipboard
    const copyRoomLink = useCallback(() => {
        const roomLink = `${window.location.origin}/room/${id}`;
        navigator.clipboard.writeText(roomLink).then(() => {
            alert('Room link copied to clipboard!');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = roomLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Room link copied to clipboard!');
        });
    }, [id]);

    // Apply remote code changes while preserving cursor position
    const applyRemoteCodeChange = useCallback((newCode) => {
        if (!editor || !monaco) return;

        // Save current cursor position
        currentCursorPosition.current = editor.getPosition();
        
        // Set flag to prevent triggering change events
        isApplyingRemoteChange.current = true;
        
        // Get current model
        const model = editor.getModel();
        if (!model) return;

        // Apply the code change using edit operations to preserve cursor position
        const fullRange = model.getFullModelRange();
        
        // Use executeEdits to apply the change while preserving undo/redo history
        editor.executeEdits('remote-update', [{
            range: fullRange,
            text: newCode
        }]);

        // Restore cursor position after a small delay
        setTimeout(() => {
            if (currentCursorPosition.current && editor) {
                // Validate the cursor position against the new content
                const model = editor.getModel();
                if (model) {
                    const lineCount = model.getLineCount();
                    const targetLine = Math.min(currentCursorPosition.current.lineNumber, lineCount);
                    const lineLength = model.getLineLength(targetLine);
                    const targetColumn = Math.min(currentCursorPosition.current.column, lineLength + 1);
                    
                    editor.setPosition({
                        lineNumber: targetLine,
                        column: targetColumn
                    });
                }
            }
            
            // Reset the flag
            isApplyingRemoteChange.current = false;
        }, 10);
        
        // Update the context state
        setCode(newCode);
    }, [editor, monaco, setCode]);

    // Update cursor decorations with proper styling
    const updateCursorDecorations = useCallback(() => {
        if (!editor || !monaco) return;

        const newDecorations = [];
        
        userCursors.forEach((cursor, userId) => {
            if (userId !== currentUserId.current) {
                const position = cursor.position;
                const color = cursor.color;
                const animalName = cursor.animalName || getUserAnimal(userId);
                
                if (position && position.lineNumber && position.column) {
                    // Create cursor line decoration
                    newDecorations.push({
                        range: new monaco.Range(
                            position.lineNumber, 
                            position.column, 
                            position.lineNumber, 
                            position.column
                        ),
                        options: {
                            className: `remote-cursor-${userId.replace(/[^a-zA-Z0-9]/g, '')}`,
                            afterContentClassName: `remote-cursor-label-${userId.replace(/[^a-zA-Z0-9]/g, '')}`,
                            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                            hoverMessage: { value: `${animalName} is editing here` }
                        }
                    });
                }
            }
        });

        const newDecorationIds = editor.deltaDecorations(decorations, newDecorations);
        setDecorations(newDecorationIds);
    }, [editor, monaco, userCursors, decorations, getUserAnimal]);

    // Generate dynamic CSS for user cursors
    const generateCursorCSS = useCallback(() => {
        let css = '';
        userCursors.forEach((cursor, userId) => {
            if (userId !== currentUserId.current) {
                const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '');
                const color = cursor.color;
                const animalName = cursor.animalName || getUserAnimal(userId);
                
                css += `
                    .remote-cursor-${cleanId} {
                        border-left: 2px solid ${color} !important;
                        position: relative;
                        z-index: 999;
                        animation: blink-cursor-${cleanId} 1s steps(2, start) infinite;
                    }
                    @keyframes blink-cursor-${cleanId} {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }

                    .remote-cursor-label-${cleanId}::after {
                        content: "${animalName}";
                        position: absolute;
                        top: -16px;
                        left: -1px;
                        background-color: ${color};
                        color: #fff;
                        padding: 1px 5px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 500;
                        white-space: nowrap;
                        z-index: 1000;
                        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
                        pointer-events: none;
                        opacity: 0.9;
                    }
                `;

            }
        });
        return css;
    }, [userCursors, getUserAnimal]);

    // Socket event handlers
    useEffect(() => {
        if (!socket) return;

        if (!socket.connected) {
            socket.connect();
        }

        const handleConnect = () => {
            setIsConnected(true);
            setConnectionStatus('Connected');
            setRoomId(id);
            currentUserId.current = socket.id;
            currentUserColor.current = getUserColor(socket.id);
            currentUserAnimal.current = getUserAnimal(socket.id);
            socket.emit('join-room', id);
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            setConnectionStatus('Disconnected');
            setConnectedUsers(new Set());
            setUserCursors(new Map());
        };

        const handleRoomState = (roomState) => {
            console.log('Received room state:', roomState);
            
            // Apply initial room state without preserving cursor (first load)
            setIsCodeChangedBySocket(true);
            setCode(roomState.code);
            setStdin(roomState.stdin);
            setFlags(roomState.flags);
            setStdout(roomState.stdout);
            setStderr(roomState.stderr);
            setConnectionStatus('Connected');
            
            // Set connected users
            if (roomState.users) {
                setConnectedUsers(new Set(roomState.users));
            }
        };

        const handleCodeUpdate = (data) => {
            console.log('Received code update:', data);
            if (data.userId !== currentUserId.current) {
                // Use the new function to apply remote changes while preserving cursor position
                applyRemoteCodeChange(data.code);
                
                // Update user cursor position
                if (data.position) {
                    setUserCursors(prev => {
                        const newCursors = new Map(prev);
                        newCursors.set(data.userId, {
                            position: data.position,
                            color: getUserColor(data.userId),
                            animalName: data.animalName || getUserAnimal(data.userId),
                            lastUpdate: Date.now()
                        });
                        return newCursors;
                    });
                }
            }
        };

        const handleCursorUpdate = (data) => {
            console.log('Received cursor update:', data);
            if (data.userId !== currentUserId.current) {
                setUserCursors(prev => {
                    const newCursors = new Map(prev);
                    newCursors.set(data.userId, {
                        position: data.position,
                        color: getUserColor(data.userId),
                        animalName: data.animalName || getUserAnimal(data.userId),
                        lastUpdate: Date.now()
                    });
                    return newCursors;
                });
            }
        };

        const handleUserJoined = (data) => {
            console.log('User joined:', data);
            setConnectedUsers(prev => new Set([...prev, data.userId]));
        };

        const handleUserLeft = (data) => {
            console.log('User left:', data);
            setConnectedUsers(prev => {
                const newUsers = new Set(prev);
                newUsers.delete(data.userId);
                return newUsers;
            });
            
            setUserCursors(prev => {
                const newCursors = new Map(prev);
                newCursors.delete(data.userId);
                return newCursors;
            });
        };

        const handleUserCountUpdate = (data) => {
            console.log('User count update:', data);
        };

        // Attach event listeners
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('room-state', handleRoomState);
        socket.on('code-update', handleCodeUpdate);
        socket.on('cursor-update', handleCursorUpdate);
        socket.on('user-joined', handleUserJoined);
        socket.on('user-left', handleUserLeft);
        socket.on('user-count-update', handleUserCountUpdate);

        socket.on('stdin-update', (data) => {
            setStdin(data.stdin);
        });

        socket.on('flags-update', (data) => {
            setFlags(data.flags);
        });

        socket.on('execution-result', (result) => {
            setStdout(result.stdout);
            setStderr(result.stderr);
        });

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('room-state', handleRoomState);
            socket.off('code-update', handleCodeUpdate);
            socket.off('cursor-update', handleCursorUpdate);
            socket.off('user-joined', handleUserJoined);
            socket.off('user-left', handleUserLeft);
            socket.off('user-count-update', handleUserCountUpdate);
            socket.off('stdin-update');
            socket.off('flags-update');
            socket.off('execution-result');
        };
    }, [socket, id, setRoomId, setIsConnected, setCode, setStdin, setFlags, setStdout, setStderr, getUserColor, getUserAnimal, applyRemoteCodeChange]);

    // Update decorations when cursors change
    useEffect(() => {
        updateCursorDecorations();
    }, [updateCursorDecorations]);

    // Debounced code change handler
    const handleCodeChange = useCallback((value) => {
        if (isCodeChangedBySocket) {
            setIsCodeChangedBySocket(false);
            return;
        }

        if (isApplyingRemoteChange.current) {
            return;
        }

        setCode(value);
        
        // Clear existing debounce timer
        if (codeChangeDebounceTimer.current) {
            clearTimeout(codeChangeDebounceTimer.current);
        }

        // Debounce the socket emission
        codeChangeDebounceTimer.current = setTimeout(() => {
            if (socket && isConnected && editor && !isApplyingRemoteChange.current) {
                const position = editor.getPosition();
                const changeData = {
                    roomId: id,
                    code: value,
                    userId: currentUserId.current,
                    position: position,
                    timestamp: Date.now(),
                    animalName: currentUserAnimal.current
                };
                
                console.log('Sending code change:', changeData);
                socket.emit('code-change', changeData);
                lastCodeChangeTime.current = Date.now();
            }
        }, 500); // Reduced debounce time for better responsiveness
    }, [socket, isConnected, id, setCode, isCodeChangedBySocket, editor]);

    // Throttled cursor position change handler
    const handleCursorPositionChange = useCallback((e) => {
        if (socket && isConnected && e.position && !isApplyingRemoteChange.current) {
            const now = Date.now();
            
            // Clear existing throttle timer
            if (cursorMoveThrottleTimer.current) {
                clearTimeout(cursorMoveThrottleTimer.current);
            }
            
            // Throttle cursor updates
            cursorMoveThrottleTimer.current = setTimeout(() => {
                if (now - lastCursorMoveTime.current > 100) {
                    const cursorData = {
                        roomId: id,
                        userId: currentUserId.current,
                        position: e.position,
                        animalName: currentUserAnimal.current
                    };
                    
                    console.log('Sending cursor change:', cursorData);
                    socket.emit('cursor-change', cursorData);
                    lastCursorMoveTime.current = now;
                }
            }, 100);
        }
    }, [socket, isConnected, id]);

    // Handle input changes
    const handleStdinChange = useCallback((e) => {
        const value = e.target.value;
        setStdin(value);
        if (socket && isConnected) {
            socket.emit('stdin-change', { roomId: id, stdin: value });
        }
    }, [socket, isConnected, id, setStdin]);

    const handleFlagsChange = useCallback((e) => {
        const value = e.target.value;
        setFlags(value);
        if (socket && isConnected) {
            socket.emit('flags-change', { roomId: id, flags: value });
        }
    }, [socket, isConnected, id, setFlags]);

    const runCode = useCallback(() => {
        if (socket && isConnected) {
            socket.emit('run-code', { roomId: id });
        }
    }, [socket, isConnected, id]);

    // Add keyboard shortcuts
    const addCommands = useCallback(() => {
        if (!editor || !monaco) return;
        
        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            runCode
        );
        
        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Shift,
            () => setStdoutActive(prev => !prev)
        );
    }, [editor, monaco, runCode, setStdoutActive]);

    useEffect(() => {
        addCommands();
    }, [addCommands]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (evt) => {
            if (evt.ctrlKey || evt.metaKey) {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    runCode();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [runCode]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (codeChangeDebounceTimer.current) {
                clearTimeout(codeChangeDebounceTimer.current);
            }
            if (cursorMoveThrottleTimer.current) {
                clearTimeout(cursorMoveThrottleTimer.current);
            }
        };
    }, []);

    // Clean up old cursor positions - REDUCED TIMING
    useEffect(() => {
        const cleanup = setInterval(() => {
            const now = Date.now();
            const maxAge = 5000; // Reduced to 5 seconds
            
            setUserCursors(prev => {
                const newCursors = new Map();
                prev.forEach((cursor, userId) => {
                    if (now - cursor.lastUpdate < maxAge) {
                        newCursors.set(userId, cursor);
                    }
                });
                return newCursors;
            });
        }, 2000); // Clean up every 2 seconds

        return () => clearInterval(cleanup);
    }, []);

    return (
        <div className="app-container">
            {/* Dynamic CSS for user cursors */}
            <style>
                {generateCursorCSS()}
            </style>

            {/* Header */}
            <div className='Header'>
                <div className="logo">Code Collab</div>
                <div className='header-center'>
                    <button onClick={runCode} className="run-button">
                        <span>▶</span> Run Code (Ctrl+Enter)
                    </button>
                    <span className={`badge ${isConnected ? 'bg-success' : 'bg-danger'}`}>
                        {connectionStatus}
                    </span>
                    {currentUserAnimal.current && (
                        <span className="current-user-badge" style={{ color: currentUserColor.current }}>
                            You are: {currentUserAnimal.current}
                        </span>
                    )}
                </div>
                <div className='header-right'>
                    <div><span className="room-info">Room: {id}</span></div>
                    <button className="btn btn-outline-light btn-sm" onClick={copyRoomLink}>
                        📋 Copy Link
                    </button>
                    <button className="btn btn-outline-light btn-sm" onClick={() => navigate('/')}>
                        🚪 Leave Room
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className='Body'>
                {/* Editor */}
                <div className="Editor">
                    <Editor
                        height="100%"
                        defaultLanguage={langs[langId]}
                        value={code}
                        theme="vs-dark"
                        width="100%"
                        onChange={handleCodeChange}
                        onMount={(edit) => {
                            setEditor(edit);
                            edit.onDidChangeCursorPosition(handleCursorPositionChange);
                        }}
                        options={{
                            fontSize: 14,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            automaticLayout: true,
                            cursorBlinking: 'smooth',
                            cursorSmoothCaretAnimation: true,
                        }}
                    />
                </div>

                {/* Sidebar */}
                <div className='Sidebar'>
                    {/* Input Section */}
                    <div className="sidebar-section">
                        <div className="toggle-label">Input</div>
                        <div className="toggle-section">
                            <button
                                className={`editor-btn ${stdinActive ? 'active' : ''}`}
                                onClick={() => setStdinActive(!stdinActive)}
                            >
                                STDIN
                            </button>
                            <span className="separator">|</span>
                            <button
                                className={`editor-btn ${!stdinActive ? 'active' : ''}`}
                                onClick={() => setStdinActive(!stdinActive)}
                            >
                                FLAGS
                            </button>
                        </div>
                        
                        <div className="io-container">
                            {stdinActive ? (
                                <div className='stdin'>
                                    <textarea 
                                        value={stdin} 
                                        onChange={handleStdinChange}
                                        disabled={!isConnected}
                                        placeholder="Enter your input data here..."
                                    />
                                </div>
                            ) : (
                                <div className='flags'>
                                    <textarea 
                                        value={flags} 
                                        onChange={handleFlagsChange}
                                        disabled={!isConnected}
                                        placeholder="Enter compiler flags here..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Output Section */}
                    <div className="sidebar-section">
                        <div className="toggle-label">Output</div>
                        <div className="toggle-section">
                            <button
                                className={`editor-btn ${stdoutActive ? 'active' : ''}`}
                                onClick={() => setStdoutActive(!stdoutActive)}
                            >
                                STDOUT
                            </button>
                            <span className="separator">|</span>
                            <button
                                className={`editor-btn ${!stdoutActive ? 'active' : ''}`}
                                onClick={() => setStdoutActive(!stdoutActive)}
                            >
                                STDERR
                            </button>
                        </div>
                        
                        <div className="io-container">
                            {stdoutActive ? (
                                <div className='stdout output-container'>
                                    <pre className="output-content">{stdout || 'No output yet...'}</pre>
                                </div>
                            ) : (
                                <div className='stderr output-container'>
                                    <pre className="output-content">{stderr || 'No errors...'}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className='Footer'>
                🚀 Collaborative Code Editor • Room {id}
            </div>
        </div>
    );
}

export default GetCode;
