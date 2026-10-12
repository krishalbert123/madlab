import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const CodeArenaApp());
}

class CodeArenaApp extends StatelessWidget {
  const CodeArenaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CodeArena',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF00E5FF),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0A0C10),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
