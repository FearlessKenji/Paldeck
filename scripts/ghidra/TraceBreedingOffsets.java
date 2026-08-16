// Find and decompile functions that access multiple UPalGameSetting mutation offsets.
// @category Paldeck

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;

public class TraceBreedingOffsets extends GhidraScript {
	private static final long[] OFFSETS = { 0x1d68, 0x1d6c, 0x1d70, 0x1d74, 0x1d78, 0x1d7c, 0x1d80, 0x1d84, 0x1d88, 0x1d89 };

	@Override
	public void run() throws Exception {
		if (getScriptArgs().length != 1) {
			throw new IllegalArgumentException("Expected output file path.");
		}
		Map<Function, Set<Long>> hits = new LinkedHashMap<>();
		InstructionIterator instructions = currentProgram.getListing().getInstructions(true);
		while (instructions.hasNext()) {
			Instruction instruction = instructions.next();
			Function function = currentProgram.getFunctionManager().getFunctionContaining(instruction.getAddress());
			if (function == null) {
				continue;
			}
			for (int operand = 0; operand < instruction.getNumOperands(); operand += 1) {
				for (Object object : instruction.getOpObjects(operand)) {
					if (object instanceof Scalar) {
						long value = ((Scalar) object).getUnsignedValue();
						for (long offset : OFFSETS) {
							if (value == offset) {
								hits.computeIfAbsent(function, ignored -> new LinkedHashSet<>()).add(offset);
							}
						}
					}
				}
			}
		}
		List<Function> candidates = new ArrayList<>();
		for (Map.Entry<Function, Set<Long>> hit : hits.entrySet()) {
			if (hit.getValue().size() >= 2) {
				candidates.add(hit.getKey());
			}
		}
		DecompInterface decompiler = new DecompInterface();
		decompiler.openProgram(currentProgram);
		try (PrintWriter writer = new PrintWriter(new File(getScriptArgs()[0]), StandardCharsets.UTF_8)) {
			writer.printf("candidateFunctions=%d%n", candidates.size());
			for (Function function : candidates) {
				writer.printf("%n## %s @ %s offsets=%s%n", function.getName(), function.getEntryPoint(), hits.get(function));
				DecompileResults result = decompiler.decompileFunction(function, 300, monitor);
				writer.println(result.decompileCompleted() ? result.getDecompiledFunction().getC() : "DECOMPILE FAILED: " + result.getErrorMessage());
			}
		}
		decompiler.dispose();
	}
}
