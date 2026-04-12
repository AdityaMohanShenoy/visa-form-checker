import 'package:flutter/material.dart';
import '../models/ocr_result.dart';
import '../services/api_service.dart';

class ReviewScreen extends StatefulWidget {
  final ApiService apiService;
  final OcrResult ocrResult;

  const ReviewScreen({
    super.key,
    required this.apiService,
    required this.ocrResult,
  });

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  late final Map<String, TextEditingController> _controllers;
  late final TextEditingController _labelController;
  bool _saving = false;

  static const _fieldLabels = {
    'surname': 'Surname',
    'given_names': 'Given Names',
    'passport_number': 'Passport Number',
    'nationality': 'Nationality',
    'date_of_birth': 'Date of Birth',
    'gender': 'Gender',
    'expiry_date': 'Expiry Date',
    'issuing_country': 'Issuing Country',
    'document_type': 'Document Type',
  };

  @override
  void initState() {
    super.initState();
    final fields = widget.ocrResult.mrz.fields!.toMap();

    _controllers = {
      for (final key in _fieldLabels.keys)
        key: TextEditingController(text: fields[key] ?? ''),
    };

    final name = [fields['given_names'], fields['surname']]
        .where((s) => s != null && s.isNotEmpty)
        .join(' ');
    final country = fields['issuing_country'] ?? 'Passport';
    _labelController =
        TextEditingController(text: name.isNotEmpty ? '$name - $country' : '');
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _labelController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final label = _labelController.text.trim();
    if (label.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a profile label')),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final data = <String, dynamic>{'label': label};
      for (final entry in _controllers.entries) {
        final val = entry.value.text.trim();
        if (val.isNotEmpty) data[entry.key] = val;
      }

      if (widget.ocrResult.mrz.raw != null) {
        data['mrz_raw'] = widget.ocrResult.mrz.raw;
      }
      if (widget.ocrResult.imageHash != null) {
        data['source_image_hash'] = widget.ocrResult.imageHash;
      }

      await widget.apiService.createProfile(data);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile saved! It will appear in the Chrome extension.'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      setState(() => _saving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review & Save')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 48),
          const SizedBox(height: 8),
          const Text(
            'MRZ Extracted Successfully',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.green,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Review the fields below and edit if needed.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 24),

          // Label
          TextField(
            controller: _labelController,
            decoration: const InputDecoration(
              labelText: 'Profile Label',
              hintText: 'e.g., John Doe - IND',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),

          // MRZ Fields
          ..._fieldLabels.entries.map((entry) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _controllers[entry.key],
                  decoration: InputDecoration(
                    labelText: entry.value,
                    border: const OutlineInputBorder(),
                  ),
                ),
              )),

          const SizedBox(height: 8),
          SizedBox(
            height: 50,
            child: FilledButton.icon(
              onPressed: _saving ? null : _saveProfile,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.save),
              label: Text(
                _saving ? 'Saving...' : 'Save Profile',
                style: const TextStyle(fontSize: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
