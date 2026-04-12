import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'services/connection_store.dart';
import 'screens/pairing_screen.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const VisaCheckerApp());
}

class VisaCheckerApp extends StatelessWidget {
  const VisaCheckerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Visa Form Checker',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF6B21A8),
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final _apiService = ApiService();
  final _connectionStore = ConnectionStore();

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final conn = await _connectionStore.load();

    if (conn.url != null && conn.token != null) {
      _apiService.configure(conn.url!, conn.token!);
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => HomeScreen(
              apiService: _apiService,
              connectionStore: _connectionStore,
            ),
          ),
        );
      }
    } else {
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => PairingScreen(
              apiService: _apiService,
              connectionStore: _connectionStore,
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
