import { useParams, useNavigate } from "react-router-dom";
import { useContext, useEffect, useState, useCallback } from 'react';
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

    // Copy room link to clipboard
    const copyRoomLink = () => {
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
    };

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
            socket.emit('join-room', id);
        };

        socket.once('connect', handleConnect);

        socket.on('disconnect', () => {
            setIsConnected(false);
            setConnectionStatus('Disconnected');
        });

        socket.on('room-state', (roomState) => {
            setCode(roomState.code);
            setStdin(roomState.stdin);
            setFlags(roomState.flags);
            setStdout(roomState.stdout);
            setStderr(roomState.stderr);
            setConnectionStatus('Connected');
        });

        socket.on('code-update', (data) => {
            setIsCodeChangedBySocket(true);
            setCode(data.code);
        });

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

        socket.on('user-joined', (data) => {
            console.log('User joined:', data.userId);
        });

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect');
            socket.off('room-state');
            socket.off('code-update');
            socket.off('stdin-update');
            socket.off('flags-update');
            socket.off('execution-result');
            socket.off('user-joined');
            socket.disconnect();
        };
    }, [socket, id, setRoomId, setIsConnected, setCode, setStdin, setFlags, setStdout, setStderr]);

    const codeChanged = useCallback((value) => {
        if (isCodeChangedBySocket) {
            setIsCodeChangedBySocket(false);
            return;
        }

        setCode(value);
        if (socket && isConnected) {
            socket.emit('code-change', { roomId: id, code: value });
        }
    }, [socket, isConnected, id, setCode, isCodeChangedBySocket]);

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

    const addCmd = useCallback(() => {
        if (!editor || !monaco) return;
        editor.addCommand(
            monaco.KeyMod.CtrlCmd + monaco.KeyCode.Enter,
            runCode
        );
        editor.addCommand(
            monaco.KeyMod.CtrlCmd + monaco.KeyCode.Shift,
            () => setStdoutActive(prev => !prev)
        );
    }, [editor, monaco, runCode, setStdoutActive]);

    useEffect(() => {
        addCmd();
    }, [addCmd]);

    useEffect(() => {
        const handleShortcutKeys = evt => {
            if (evt.ctrlKey) {
                if (evt.key === 'Enter') {
                    runCode();
                } else if (evt.key === 'Shift') {
                    setStdoutActive(prev => !prev);
                }
            }
        };
        window.addEventListener("keyup", handleShortcutKeys);
        return () => {
            window.removeEventListener("keyup", handleShortcutKeys);
        };
    }, [runCode, setStdoutActive]);

    return (
        <div className="app-container">
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
                </div>
                <div className='header-right'>
                    <span className="room-info">Room: {id}</span>
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
                        onChange={codeChanged}
                        onMount={(edit) => setEditor(edit)}
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
                        
                        {/* Input Fields */}
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
                        
                        {/* Output Fields - Fixed scrolling issue */}
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
