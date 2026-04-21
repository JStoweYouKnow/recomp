import AVFoundation
import AVFAudio
import Foundation
import Observation
import Speech

/// Live speech-to-text for iPhone using `SFSpeechRecognizer` (on-device recognition when available).
@MainActor
@Observable
final class MealSpeechTranscription {
    var transcript: String = ""
    var isRecording = false
    var errorMessage: String?

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: .current)

    private var userRequestedStop = false

    /// Returns whether speech + microphone access are sufficient to start listening.
    func ensurePermissions() async -> Bool {
        errorMessage = nil

        let speechOK = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
        guard speechOK else {
            errorMessage = "Turn on speech recognition for Refactor in Settings → Privacy & Security → Speech Recognition."
            return false
        }

        let micOK = await AVAudioApplication.requestRecordPermission()
        guard micOK else {
            errorMessage = "Turn on the microphone for Refactor in Settings → Privacy & Security → Microphone."
            return false
        }

        return true
    }

    func startRecording() async {
        errorMessage = nil
        userRequestedStop = false
        stopRecordingSilently()

        guard await ensurePermissions() else { return }

        guard let speechRecognizer, speechRecognizer.isAvailable else {
            errorMessage = "Speech recognition isn’t available on this device right now."
            return
        }

        transcript = ""

        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            errorMessage = error.localizedDescription
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if speechRecognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            errorMessage = error.localizedDescription
            cleanupAfterFailure()
            return
        }

        isRecording = true

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.transcript = result.bestTranscription.formattedString
                }
                if let error, !self.userRequestedStop {
                    self.errorMessage = error.localizedDescription
                }
                if error != nil || result?.isFinal == true {
                    self.stopRecordingSilently()
                }
            }
        }
    }

    func stopRecording() {
        userRequestedStop = true
        stopRecordingSilently()
    }

    private func stopRecordingSilently() {
        isRecording = false
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func cleanupAfterFailure() {
        isRecording = false
        if audioEngine.isRunning { audioEngine.stop() }
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
