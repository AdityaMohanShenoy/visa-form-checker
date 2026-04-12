import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';
import '../models/ocr_result.dart';
import 'review_screen.dart';

class CaptureScreen extends StatefulWidget {
  final ApiService apiService;
  final bool useGallery;

  const CaptureScreen({super.key, required this.apiService, this.useGallery = false});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final ImagePicker _picker = ImagePicker();
  File? _imageFile;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pickImage(widget.useGallery ? ImageSource.gallery : ImageSource.camera);
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 2000,
    );

    if (picked == null) {
      if (mounted && _imageFile == null) Navigator.of(context).pop();
      return;
    }

    setState(() {
      _imageFile = File(picked.path);
      _error = null;
    });
  }

  Future<void> _upload() async {
    if (_imageFile == null) return;

    setState(() {
      _uploading = true;
      _error = null;
    });

    try {
      final result = await widget.apiService.extractMrz(_imageFile!);

      if (!result.mrz.success) {
        setState(() {
          _error = result.mrz.error ?? 'MRZ extraction failed. Try a clearer photo.';
          _uploading = false;
        });
        return;
      }

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => ReviewScreen(
              apiService: widget.apiService,
              ocrResult: result,
            ),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _error = 'Upload failed: $e';
        _uploading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Passport')),
      body: _imageFile == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(_imageFile!, fit: BoxFit.contain),
                  ),
                  const SizedBox(height: 20),
                  if (_error != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(color: Colors.red.shade800),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploading ? null : () => _pickImage(ImageSource.camera),
                          icon: const Icon(Icons.camera_alt),
                          label: const Text('Retake'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploading ? null : () => _pickImage(ImageSource.gallery),
                          icon: const Icon(Icons.photo_library),
                          label: const Text('Gallery'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _uploading ? null : _upload,
                      icon: _uploading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.upload),
                      label: Text(_uploading ? 'Processing...' : 'Extract MRZ'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
