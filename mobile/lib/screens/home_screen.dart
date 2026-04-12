import 'package:flutter/material.dart';
import '../models/profile.dart';
import '../services/api_service.dart';
import '../services/connection_store.dart';
import 'capture_screen.dart';
import 'pairing_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiService apiService;
  final ConnectionStore connectionStore;

  const HomeScreen({
    super.key,
    required this.apiService,
    required this.connectionStore,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Profile> _profiles = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProfiles();
  }

  Future<void> _loadProfiles() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profiles = await widget.apiService.listProfiles();
      setState(() {
        _profiles = profiles;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load profiles: $e';
        _loading = false;
      });
    }
  }

  Future<void> _unpair() async {
    await widget.connectionStore.clear();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => PairingScreen(
            apiService: widget.apiService,
            connectionStore: widget.connectionStore,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Visa Form Checker'),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Re-pair',
            onPressed: _unpair,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadProfiles,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Scan button
            SizedBox(
              height: 56,
              child: FilledButton.icon(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) =>
                          CaptureScreen(apiService: widget.apiService),
                    ),
                  );
                  _loadProfiles();
                },
                icon: const Icon(Icons.camera_alt, size: 24),
                label: const Text(
                  'Scan Passport',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 48,
              child: OutlinedButton.icon(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => CaptureScreen(
                        apiService: widget.apiService,
                        useGallery: true,
                      ),
                    ),
                  );
                  _loadProfiles();
                },
                icon: const Icon(Icons.photo_library, size: 22),
                label: const Text(
                  'Upload from Device',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Profiles
            Text(
              'Saved Profiles',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 12),

            if (_loading) const Center(child: CircularProgressIndicator()),

            if (_error != null)
              Card(
                color: Colors.red.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                ),
              ),

            if (!_loading && _profiles.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'No profiles yet. Scan a passport to create one.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              ),

            ..._profiles.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.person),
                    title: Text(
                      p.label,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      [
                        p.passportNumber,
                        p.nationality,
                        p.dateOfBirth,
                      ].where((s) => s != null).join(' | '),
                    ),
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
