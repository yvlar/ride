import AVFoundation
import Foundation

final class RideCarPlaySpeech {
    static let shared = RideCarPlaySpeech()

    private let synthesizer = AVSpeechSynthesizer()

    private init() {}

    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }
        activateSession()
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice =
            AVSpeechSynthesisVoice(language: "fr-CA")
            ?? AVSpeechSynthesisVoice(language: "fr-FR")
        synthesizer.speak(utterance)
    }

    func cancel() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(
            .playback,
            mode: .voicePrompt,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try? session.setActive(true)
    }
}
