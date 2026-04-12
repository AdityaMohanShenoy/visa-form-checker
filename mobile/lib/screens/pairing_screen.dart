import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';
import '../services/connection_store.dart';
import 'home_screen.dart';

class PairingScreen extends StatefulWidget {
  final ApiService apiService;
  final ConnectionStore connectionStore;

  const PairingScreen({
    super.key,
    required this.apiService,
    required this.connectionStore,
  });

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final MobileScannerController _scannerController = MobileScannerController();
  bool _processing = false;
  String? _error;

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    setState(() {
      _processing = true;
      _error = null;
    });

    try {
      final data = jsonDecode(barcode.rawValue!) as Map<String, dynamic>;
      final url = data['url'] as String?;
      final token = data['token'] as String?;

      if (url == null || token == null) {
        setState(() {
          _error = 'Invalid QR code. Expected Visa Form Checker pairing code.';
          _processing = false;
        });
        return;
      }

      widget.apiService.configure(url, token);
      final healthy = await widget.apiService.healthCheck();

      if (!healthy) {
        setState(() {
          _error =
              'Cannot reach backend at $url. Make sure both devices are on the same WiFi and the backend is running.';
          _processing = false;
        });
        return;
      }

      await widget.connectionStore.save(url, token);

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => HomeScreen(
              apiService: widget.apiService,
              connectionStore: widget.connectionStore,
            ),
          ),
        );
      }
    } on FormatException {
      setState(() {
        _error = 'Not a valid pairing QR code.';
        _processing = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Connection failed: $e';
        _processing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          MobileScanner(
            controller: _scannerController,
            onDetect: _onDetect,
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 40),
                const Text(
                  'Scan QR Code',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    'Open the Chrome extension settings on your PC and generate a pairing QR code.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                ),
                const Spacer(),
                if (_processing)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.all(24),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade900.withValues(alpha: 0.9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.white),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _error!,
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
