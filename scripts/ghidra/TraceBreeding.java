// Ghidra headless post-script: locate breeding-related native strings and decompile their users.
// @category Paldeck

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class TraceBreeding extends GhidraScript {
	private static final String[] TERMS = {
		"Combi_MutationRate",
		"Combi_MutationRankCoefficient",
		"Combi_MutationRankDiffPenalty",
		"Combi_MutationRandomCoefficient",
		"Combi_MutationMinTalent",
		"Combi_MutationInitialRank",
		"bIsMutationPalEgg",
		"PalEgg_MutationPal",
		"MutationRateBonusPercent",
		"DT_PalCombiUnique",
		"CombiRank",
	};

	@Override
	public void run() throws Exception {
		if (getScriptArgs().length != 1) {
			throw new IllegalArgumentException("Expected output file path.");
		}
		File output = new File(getScriptArgs()[0]);
		output.getParentFile().mkdirs();
		try (PrintWriter writer = new PrintWriter(output, StandardCharsets.UTF_8)) {
			writer.printf("program=%s%n", currentProgram.getExecutablePath());
			writer.printf("sha256=%s%n", currentProgram.getExecutableSHA256());
			DecompInterface decompiler = new DecompInterface();
			decompiler.openProgram(currentProgram);
			Set<Function> functions = new LinkedHashSet<>();
			for (String term : TERMS) {
				writer.printf("%n## TERM %s%n", term);
				findTerm(term, term.getBytes(StandardCharsets.US_ASCII), writer, functions);
				findTerm(term + " [UTF-16LE]", (term + "\0").getBytes(StandardCharsets.UTF_16LE), writer, functions);
			}
			Set<Function> expanded = new LinkedHashSet<>(functions);
			for (Function function : functions) {
				ReferenceIterator callers = currentProgram.getReferenceManager().getReferencesTo(function.getEntryPoint());
				while (callers.hasNext()) {
					Function caller = currentProgram.getFunctionManager().getFunctionContaining(callers.next().getFromAddress());
					if (caller != null) {
						expanded.add(caller);
					}
				}
			}
			for (Function function : expanded) {
				writer.printf("%n## FUNCTION %s @ %s%n", function.getName(), function.getEntryPoint());
				DecompileResults result = decompiler.decompileFunction(function, 180, monitor);
				if (result.decompileCompleted()) {
					writer.println(result.getDecompiledFunction().getC());
				} else {
					writer.printf("DECOMPILE FAILED: %s%n", result.getErrorMessage());
				}
			}
			decompiler.dispose();
		}
	}

	private void findTerm(String label, byte[] bytes, PrintWriter writer, Set<Function> functions) throws Exception {
		Memory memory = currentProgram.getMemory();
		AddressIterator starts = currentProgram.getMemory().getAllInitializedAddressSet().getAddresses(true);
		Address cursor = starts.hasNext() ? starts.next() : null;
		while (cursor != null) {
			Address found = memory.findBytes(cursor, bytes, null, true, monitor);
			if (found == null) {
				break;
			}
			writer.printf("string %s @ %s%n", label, found);
			ReferenceIterator references = currentProgram.getReferenceManager().getReferencesTo(found);
			while (references.hasNext()) {
				Reference reference = references.next();
				Function function = currentProgram.getFunctionManager().getFunctionContaining(reference.getFromAddress());
				writer.printf("  xref %s function=%s%n", reference.getFromAddress(), function == null ? "(none)" : function.getName());
				if (function != null) {
					functions.add(function);
				}
			}
			cursor = found.add(bytes.length);
		}
	}
}
